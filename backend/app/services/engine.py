"""Turn engine: starts playthroughs, resolves choices, regenerates turns.

Information hiding is structural: this module writes `player_view` (safe to show during
play) and `gm_state` (hidden until review) as separate columns, and play endpoints only
ever serialize `player_view`.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Playthrough, Scenario, Turn
from app.prompts.engine import (
    analysis_prompt,
    initial_turn_prompt,
    resolve_turn_prompt,
    validate_action_prompt,
)
from app.schemas import ActionValidation, PlaythroughAnalysis, TurnGeneration
from app.services import llm

HISTORY_WINDOW = 10  # older turns live on in gm_state.scene_summary
MAX_OPTIONS = 8  # generated (up to 5) plus player-suggested ones


class EngineError(Exception):
    """Invalid play action (bad option, turn already resolved, finished playthrough)."""


def _player_view(generation: TurnGeneration) -> dict:
    return {
        "narrative": generation.narrative,
        "visible_state_summary": generation.visible_state_summary,
        "options": [
            {"id": f"opt-{i + 1}", "text": opt.text, "reasoning": opt.reasoning}
            for i, opt in enumerate(generation.options)
        ],
        "epilogue": generation.epilogue,
    }


async def latest_turn(db: AsyncSession, playthrough_id: uuid.UUID) -> Turn | None:
    return await db.scalar(
        select(Turn)
        .where(Turn.playthrough_id == playthrough_id)
        .order_by(Turn.index.desc())
        .limit(1)
    )


async def start_playthrough(
    db: AsyncSession, scenario: Scenario, owner_session_id: uuid.UUID, role_name: str
) -> Playthrough:
    if role_name not in {role.get("name") for role in scenario.roles}:
        raise EngineError(f"scenario has no role named {role_name!r}")

    playthrough = Playthrough(
        scenario_id=scenario.id, owner_session_id=owner_session_id, role_name=role_name
    )
    db.add(playthrough)
    await db.flush()

    system, user = initial_turn_prompt(scenario, role_name)
    generation = await llm.generate(db, "initial_turn", system, user, TurnGeneration)

    db.add(
        Turn(
            playthrough_id=playthrough.id,
            index=0,
            player_view=_player_view(generation),
            gm_state=generation.gm_state.model_dump(),
            is_final=generation.is_final,
        )
    )
    await db.commit()
    return playthrough


async def _history(db: AsyncSession, playthrough_id: uuid.UUID) -> list[dict]:
    turns = (
        await db.scalars(
            select(Turn)
            .where(Turn.playthrough_id == playthrough_id)
            .order_by(Turn.index.desc())
            .limit(HISTORY_WINDOW)
        )
    ).all()
    history = []
    for turn in reversed(turns):
        chosen = None
        if turn.chosen_option_id:
            chosen = next(
                (
                    o["text"]
                    for o in turn.player_view.get("options", [])
                    if o["id"] == turn.chosen_option_id
                ),
                None,
            )
        history.append(
            {
                "index": turn.index,
                "narrative": turn.player_view.get("narrative", ""),
                "chosen": chosen,
            }
        )
    return history


async def resolve_choice(
    db: AsyncSession, playthrough: Playthrough, scenario: Scenario, option_id: str
) -> Turn:
    if playthrough.status != "active":
        raise EngineError("playthrough is not active")

    current = await latest_turn(db, playthrough.id)
    if current is None or current.is_final:
        raise EngineError("no open turn to act on")
    # retrying the same option is allowed (idempotent thanks to the LLM cache);
    # switching options after one was recorded is not
    if current.chosen_option_id is not None and current.chosen_option_id != option_id:
        raise EngineError("this turn was already resolved with a different option")

    option = next((o for o in current.player_view.get("options", []) if o["id"] == option_id), None)
    if option is None:
        raise EngineError(f"option {option_id!r} is not one of the current turn's options")

    current.chosen_option_id = option_id
    history = await _history(db, playthrough.id)

    system, user = resolve_turn_prompt(
        scenario, playthrough.role_name, current.gm_state, history, option["text"]
    )
    generation = await llm.generate(
        db, f"resolve_turn_{current.index + 1}", system, user, TurnGeneration
    )

    next_turn = Turn(
        playthrough_id=playthrough.id,
        index=current.index + 1,
        player_view=_player_view(generation),
        gm_state=generation.gm_state.model_dump(),
        is_final=generation.is_final,
    )
    db.add(next_turn)

    if generation.is_final:
        playthrough.status = "completed"
        playthrough.completed_at = datetime.now(UTC)

    await db.commit()
    return next_turn


async def suggest_action(
    db: AsyncSession, playthrough: Playthrough, scenario: Scenario, text: str
) -> tuple[bool, str, Turn]:
    """Validate a player-suggested action; when accepted, append it to the open turn's
    options. Returns (accepted, rejection_reason, turn)."""
    if playthrough.status != "active":
        raise EngineError("playthrough is not active")

    current = await latest_turn(db, playthrough.id)
    if current is None or current.is_final:
        raise EngineError("no open turn to act on")
    if current.chosen_option_id is not None:
        raise EngineError("this turn was already resolved")

    text = text.strip()
    options = current.player_view.get("options", [])
    if any(o["text"].strip().lower() == text.lower() for o in options):
        raise EngineError("that action is already one of the options")
    if len(options) >= MAX_OPTIONS:
        raise EngineError(f"this turn already has the maximum of {MAX_OPTIONS} options")

    system, user = validate_action_prompt(
        scenario,
        playthrough.role_name,
        current.gm_state,
        current.player_view.get("narrative", ""),
        options,
        text,
    )
    validation = await llm.generate(
        db, f"suggest_action_{current.index}", system, user, ActionValidation
    )

    if not validation.valid:
        return False, validation.reason, current

    # the cleaned-up phrasing may match an existing option (e.g. the same suggestion
    # resubmitted, which hits the LLM cache) — don't append a duplicate
    if any(o["text"].strip().lower() == validation.option_text.strip().lower() for o in options):
        return True, "", current

    new_option = {
        "id": f"opt-{len(options) + 1}",
        "text": validation.option_text,
        "reasoning": validation.reasoning,
        "custom": True,
    }
    # reassign the whole dict: in-place JSON mutation is invisible to SQLAlchemy
    current.player_view = {**current.player_view, "options": [*options, new_option]}
    await db.commit()
    return True, "", current


async def analyze_playthrough(
    db: AsyncSession, playthrough: Playthrough, scenario: Scenario
) -> dict:
    """Generate (once) and return the post-game analysis of the player's choices."""
    if playthrough.status == "active":
        raise EngineError("finish or abandon the playthrough before requesting an analysis")
    if playthrough.analysis is not None:
        return playthrough.analysis

    turns = (
        await db.scalars(
            select(Turn).where(Turn.playthrough_id == playthrough.id).order_by(Turn.index)
        )
    ).all()
    if not any(t.chosen_option_id for t in turns):
        raise EngineError("nothing to analyze: no choices were made in this playthrough")

    system, user = analysis_prompt(scenario, playthrough.role_name, playthrough.status, turns)
    analysis = await llm.generate(db, "analysis", system, user, PlaythroughAnalysis)

    playthrough.analysis = analysis.model_dump()
    await db.commit()
    return playthrough.analysis


async def regenerate_current(
    db: AsyncSession, playthrough: Playthrough, scenario: Scenario
) -> Turn:
    if playthrough.status != "active":
        raise EngineError("playthrough is not active")

    current = await latest_turn(db, playthrough.id)
    if current is None:
        raise EngineError("playthrough has no turns")
    if current.chosen_option_id is not None:
        raise EngineError("cannot regenerate a turn whose option was already chosen")

    nonce = current.regen_count + 1

    if current.index == 0:
        system, user = initial_turn_prompt(scenario, playthrough.role_name)
        kind = "initial_turn"
    else:
        previous = await db.scalar(
            select(Turn).where(
                Turn.playthrough_id == playthrough.id, Turn.index == current.index - 1
            )
        )
        chosen = next(
            (
                o["text"]
                for o in previous.player_view.get("options", [])
                if o["id"] == previous.chosen_option_id
            ),
            "",
        )
        history = await _history(db, playthrough.id)
        history = [h for h in history if h["index"] < current.index]
        system, user = resolve_turn_prompt(
            scenario, playthrough.role_name, previous.gm_state, history, chosen
        )
        kind = f"resolve_turn_{current.index}"

    generation = await llm.generate(db, kind, system, user, TurnGeneration, regen_nonce=nonce)

    current.player_view = _player_view(generation)
    current.gm_state = generation.gm_state.model_dump()
    current.is_final = generation.is_final
    current.regen_count = nonce
    if generation.is_final:
        playthrough.status = "completed"
        playthrough.completed_at = datetime.now(UTC)
    await db.commit()
    return current
