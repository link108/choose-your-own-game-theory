"""Turn engine: starts playthroughs, resolves choices, regenerates turns.

Information hiding is structural: this module writes `player_view` (safe to show during
play) and `gm_state` (hidden until review) as separate columns, and play endpoints only
ever serialize `player_view`.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Playthrough, Scenario, ScenarioInsight, Turn
from app.prompts.context import context_intake_prompt
from app.prompts.engine import (
    analysis_prompt,
    initial_turn_prompt,
    progress_prompt,
    resolve_turn_prompt,
    validate_action_prompt,
)
from app.schemas import (
    ActionValidation,
    ContextIntakeRequest,
    ContextIntakeResult,
    PlaythroughAnalysis,
    ScenarioContent,
    ScenarioProgress,
    TurnGeneration,
)
from app.services import llm

HISTORY_WINDOW = 10  # older turns live on in gm_state.scene_summary
MAX_OPTIONS = 8  # generated (up to 5) plus player-suggested ones


class EngineError(Exception):
    """Invalid play action (bad option, turn already resolved, finished playthrough)."""


def _content(playthrough: Playthrough, scenario: Scenario) -> ScenarioContent:
    """The scenario as this playthrough sees it: the snapshot taken at start, so living
    scenario updates never shift a game in progress. Pre-snapshot rows fall back to the
    live scenario."""
    if playthrough.scenario_snapshot:
        return ScenarioContent.model_validate(playthrough.scenario_snapshot)
    return ScenarioContent.model_validate(scenario)


def _context_args(playthrough: Playthrough) -> tuple[str, str]:
    """The compact context and risk classification frozen when this run started."""
    if not playthrough.context_summary:
        return "", "general"
    raw = playthrough.user_context or {}
    return playthrough.context_summary, raw.get("risk_domain", "general")


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
    db: AsyncSession,
    scenario: Scenario,
    owner_session_id: uuid.UUID,
    role_name: str,
    user_context: dict | None = None,
    context_summary: str = "",
) -> Playthrough:
    if role_name not in {role.get("name") for role in scenario.roles}:
        raise EngineError(f"scenario has no role named {role_name!r}")
    if scenario.context_enabled and (user_context is None or not context_summary.strip()):
        raise EngineError("this scenario requires context intake before starting")

    if not scenario.context_enabled:
        user_context = None
        context_summary = ""
    elif user_context is not None:
        user_context = {**user_context, "risk_domain": scenario.risk_domain}

    content = ScenarioContent.model_validate(scenario)
    playthrough = Playthrough(
        scenario_id=scenario.id,
        owner_session_id=owner_session_id,
        role_name=role_name,
        scenario_snapshot=content.model_dump(),
        user_context=user_context,
        context_summary=context_summary.strip(),
    )
    db.add(playthrough)
    await db.flush()

    system, user = initial_turn_prompt(
        content, role_name, context_summary.strip(), scenario.risk_domain
    )
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


async def assess_context(
    db: AsyncSession, scenario: Scenario, body: ContextIntakeRequest
) -> ContextIntakeResult:
    if not scenario.context_enabled:
        raise EngineError("this scenario does not use context intake")
    if body.role_name not in {role.get("name") for role in scenario.roles}:
        raise EngineError(f"scenario has no role named {body.role_name!r}")
    system, user = context_intake_prompt(scenario, body)
    return await llm.generate(db, "context_intake", system, user, ContextIntakeResult)


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

    player_context, risk_domain = _context_args(playthrough)
    system, user = resolve_turn_prompt(
        _content(playthrough, scenario),
        playthrough.role_name,
        current.gm_state,
        history,
        option["text"],
        player_context,
        risk_domain,
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

    player_context, risk_domain = _context_args(playthrough)
    system, user = validate_action_prompt(
        _content(playthrough, scenario),
        playthrough.role_name,
        current.gm_state,
        current.player_view.get("narrative", ""),
        options,
        text,
        player_context,
        risk_domain,
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

    player_context, risk_domain = _context_args(playthrough)
    system, user = analysis_prompt(
        _content(playthrough, scenario),
        playthrough.role_name,
        playthrough.status,
        turns,
        player_context,
        risk_domain,
    )
    analysis = await llm.generate(db, "analysis", system, user, PlaythroughAnalysis)

    playthrough.analysis = analysis.model_dump()
    await db.commit()
    return playthrough.analysis


def _run_record(playthrough: Playthrough, turns: list[Turn]) -> dict:
    """Condense one finished run for the progress prompt: choice sequence and outcome
    instead of the full transcript, so many runs fit in one context."""
    choices = []
    for turn in turns:
        if not turn.chosen_option_id:
            continue
        option = next(
            (o for o in turn.player_view.get("options", []) if o["id"] == turn.chosen_option_id),
            None,
        )
        if option:
            custom = " (player's own suggestion)" if option.get("custom") else ""
            choices.append(f"{option['text']}{custom}")
    last = turns[-1] if turns else None
    return {
        "role_name": playthrough.role_name,
        "status": playthrough.status,
        "turn_count": len(turns),
        "choices": choices,
        "goal_progress": last.gm_state.get("goal_progress", "") if last else "",
        "epilogue": last.player_view.get("epilogue", "") if last else "",
        "analysis": playthrough.analysis,
        "context_summary": playthrough.context_summary,
    }


async def analyze_progress(
    db: AsyncSession, scenario: Scenario, owner_session_id: uuid.UUID
) -> ScenarioInsight:
    """Generate (or refresh) the cross-run progress insight for one player on one
    scenario, covering every finished run in which they made at least one choice."""
    playthroughs = (
        await db.scalars(
            select(Playthrough)
            .where(
                Playthrough.scenario_id == scenario.id,
                Playthrough.owner_session_id == owner_session_id,
                Playthrough.status != "active",
            )
            .order_by(Playthrough.created_at)
        )
    ).all()

    runs = []
    for playthrough in playthroughs:
        turns = (
            await db.scalars(
                select(Turn).where(Turn.playthrough_id == playthrough.id).order_by(Turn.index)
            )
        ).all()
        record = _run_record(playthrough, list(turns))
        if record["choices"]:
            runs.append(record)
    if not runs:
        raise EngineError(
            "nothing to analyze: finish at least one playthrough of this scenario first"
        )

    # the live scenario, not per-run snapshots: the coach judges against the scenario as
    # it stands, and the cache key shifts naturally when a living scenario is revised
    content = ScenarioContent.model_validate(scenario)
    system, user = progress_prompt(content, runs)
    progress = await llm.generate(db, "scenario_progress", system, user, ScenarioProgress)

    insight = await db.scalar(
        select(ScenarioInsight).where(
            ScenarioInsight.scenario_id == scenario.id,
            ScenarioInsight.owner_session_id == owner_session_id,
        )
    )
    if insight is None:
        insight = ScenarioInsight(scenario_id=scenario.id, owner_session_id=owner_session_id)
        db.add(insight)
    insight.insight = progress.model_dump()
    insight.runs_analyzed = len(runs)
    await db.commit()
    await db.refresh(insight)
    return insight


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
        player_context, risk_domain = _context_args(playthrough)
        system, user = initial_turn_prompt(
            _content(playthrough, scenario),
            playthrough.role_name,
            player_context,
            risk_domain,
        )
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
        player_context, risk_domain = _context_args(playthrough)
        system, user = resolve_turn_prompt(
            _content(playthrough, scenario),
            playthrough.role_name,
            previous.gm_state,
            history,
            chosen,
            player_context,
            risk_domain,
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
