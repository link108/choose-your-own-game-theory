import uuid

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from app.deps import DB, SessionId
from app.metrics import PLAYTHROUGHS_ABANDONED, PLAYTHROUGHS_STARTED
from app.models import Playthrough, Scenario, Turn
from app.routers.scenarios import get_readable_scenario
from app.schemas import (
    ChoiceRequest,
    ContextIntakeRequest,
    ContextIntakeResult,
    PlaythroughAnalysis,
    PlaythroughDetail,
    PlaythroughListItem,
    PlaythroughOut,
    PlaythroughReview,
    ReviewTurn,
    StartPlaythroughRequest,
    SuggestActionRequest,
    SuggestActionResult,
    TurnOut,
)
from app.services import engine
from app.services.llm import LLMError

router = APIRouter(prefix="/api", tags=["playthroughs"])


async def _get_owned_playthrough(
    db: DB, playthrough_id: uuid.UUID, session_id: uuid.UUID
) -> tuple[Playthrough, Scenario]:
    playthrough = await db.scalar(
        select(Playthrough).where(
            Playthrough.id == playthrough_id, Playthrough.owner_session_id == session_id
        )
    )
    if playthrough is None:
        raise HTTPException(status_code=404, detail="playthrough not found")
    scenario = await db.get(Scenario, playthrough.scenario_id)
    return playthrough, scenario


async def _all_turns(db: DB, playthrough_id: uuid.UUID) -> list[Turn]:
    result = await db.scalars(
        select(Turn).where(Turn.playthrough_id == playthrough_id).order_by(Turn.index)
    )
    return list(result)


def _turn_out(turn: Turn) -> TurnOut:
    return TurnOut(
        index=turn.index,
        player_view=turn.player_view,
        chosen_option_id=turn.chosen_option_id,
        is_final=turn.is_final,
        created_at=turn.created_at,
    )


def _playthrough_title(playthrough: Playthrough, live_title: str) -> str:
    """Use the title frozen when the run began, with a fallback for legacy rows."""
    snapshot = playthrough.scenario_snapshot or {}
    title = snapshot.get("title")
    return title if isinstance(title, str) and title.strip() else live_title


@router.post("/scenarios/{scenario_id}/context-intake", response_model=ContextIntakeResult)
async def assess_context(
    scenario_id: uuid.UUID, body: ContextIntakeRequest, db: DB, session_id: SessionId
) -> ContextIntakeResult:
    scenario = await get_readable_scenario(db, scenario_id, session_id)
    try:
        return await engine.assess_context(db, scenario, body)
    except engine.EngineError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post(
    "/scenarios/{scenario_id}/playthroughs", response_model=PlaythroughDetail, status_code=201
)
async def start_playthrough(
    scenario_id: uuid.UUID, body: StartPlaythroughRequest, db: DB, session_id: SessionId
) -> PlaythroughDetail:
    scenario = await get_readable_scenario(db, scenario_id, session_id)
    try:
        playthrough = await engine.start_playthrough(
            db,
            scenario,
            session_id,
            body.role_name,
            body.context.model_dump() if body.context else None,
            body.context_summary,
        )
    except engine.EngineError as exc:
        PLAYTHROUGHS_STARTED.labels("validation").inc()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMError as exc:
        PLAYTHROUGHS_STARTED.labels("unavailable").inc()
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception:
        PLAYTHROUGHS_STARTED.labels("internal").inc()
        raise
    turns = await _all_turns(db, playthrough.id)
    return PlaythroughDetail(
        id=playthrough.id,
        scenario_id=scenario.id,
        scenario_title=_playthrough_title(playthrough, scenario.title),
        role_name=playthrough.role_name,
        status=playthrough.status,
        turns=[_turn_out(t) for t in turns],
    )


@router.get("/scenarios/{scenario_id}/playthroughs", response_model=list[PlaythroughOut])
async def list_playthroughs(
    scenario_id: uuid.UUID, db: DB, session_id: SessionId
) -> list[PlaythroughOut]:
    await get_readable_scenario(db, scenario_id, session_id)
    rows = (
        await db.execute(
            select(Playthrough, func.count(Turn.id))
            .outerjoin(Turn, Turn.playthrough_id == Playthrough.id)
            # scenarios can be shared (library), so only show the caller's own runs
            .where(
                Playthrough.scenario_id == scenario_id,
                Playthrough.owner_session_id == session_id,
            )
            .group_by(Playthrough.id)
            .order_by(Playthrough.created_at.desc())
        )
    ).all()
    out = []
    for playthrough, turn_count in rows:
        item = PlaythroughOut.model_validate(playthrough)
        item.turn_count = turn_count
        out.append(item)
    return out


@router.get("/me/playthroughs", response_model=list[PlaythroughListItem])
async def list_my_playthroughs(db: DB, session_id: SessionId) -> list[PlaythroughListItem]:
    """Every playthrough the caller owns, across all scenarios — the library's
    saved-sessions list (continue playing, completed runs)."""
    rows = (
        await db.execute(
            select(Playthrough, Scenario.title, func.count(Turn.id))
            .join(Scenario, Scenario.id == Playthrough.scenario_id)
            .outerjoin(Turn, Turn.playthrough_id == Playthrough.id)
            .where(Playthrough.owner_session_id == session_id)
            .group_by(Playthrough.id, Scenario.title)
            .order_by(Playthrough.created_at.desc())
        )
    ).all()
    out = []
    for playthrough, title, turn_count in rows:
        item = PlaythroughListItem(
            **PlaythroughOut.model_validate(playthrough).model_dump(),
            scenario_title=_playthrough_title(playthrough, title),
        )
        item.turn_count = turn_count
        out.append(item)
    return out


@router.get("/playthroughs/{playthrough_id}", response_model=PlaythroughDetail)
async def get_playthrough(
    playthrough_id: uuid.UUID, db: DB, session_id: SessionId
) -> PlaythroughDetail:
    playthrough, scenario = await _get_owned_playthrough(db, playthrough_id, session_id)
    turns = await _all_turns(db, playthrough.id)
    return PlaythroughDetail(
        id=playthrough.id,
        scenario_id=scenario.id,
        scenario_title=_playthrough_title(playthrough, scenario.title),
        role_name=playthrough.role_name,
        status=playthrough.status,
        turns=[_turn_out(t) for t in turns],
    )


@router.post("/playthroughs/{playthrough_id}/choice", response_model=TurnOut)
async def choose(
    playthrough_id: uuid.UUID, body: ChoiceRequest, db: DB, session_id: SessionId
) -> TurnOut:
    playthrough, scenario = await _get_owned_playthrough(db, playthrough_id, session_id)
    try:
        turn = await engine.resolve_choice(db, playthrough, scenario, body.option_id)
    except engine.EngineError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return _turn_out(turn)


@router.post("/playthroughs/{playthrough_id}/suggest-action", response_model=SuggestActionResult)
async def suggest_action(
    playthrough_id: uuid.UUID, body: SuggestActionRequest, db: DB, session_id: SessionId
) -> SuggestActionResult:
    playthrough, scenario = await _get_owned_playthrough(db, playthrough_id, session_id)
    try:
        accepted, reason, turn = await engine.suggest_action(db, playthrough, scenario, body.text)
    except engine.EngineError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return SuggestActionResult(accepted=accepted, reason=reason, turn=_turn_out(turn))


@router.post("/playthroughs/{playthrough_id}/regenerate", response_model=TurnOut)
async def regenerate(playthrough_id: uuid.UUID, db: DB, session_id: SessionId) -> TurnOut:
    playthrough, scenario = await _get_owned_playthrough(db, playthrough_id, session_id)
    try:
        turn = await engine.regenerate_current(db, playthrough, scenario)
    except engine.EngineError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return _turn_out(turn)


@router.post("/playthroughs/{playthrough_id}/abandon", response_model=PlaythroughOut)
async def abandon(playthrough_id: uuid.UUID, db: DB, session_id: SessionId) -> PlaythroughOut:
    playthrough, _ = await _get_owned_playthrough(db, playthrough_id, session_id)
    if playthrough.status == "active":
        playthrough.status = "abandoned"
        await db.commit()
        PLAYTHROUGHS_ABANDONED.inc()
    return PlaythroughOut.model_validate(playthrough)


@router.post("/playthroughs/{playthrough_id}/analysis", response_model=PlaythroughAnalysis)
async def analyze(playthrough_id: uuid.UUID, db: DB, session_id: SessionId) -> PlaythroughAnalysis:
    playthrough, scenario = await _get_owned_playthrough(db, playthrough_id, session_id)
    try:
        analysis = await engine.analyze_playthrough(db, playthrough, scenario)
    except engine.EngineError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return PlaythroughAnalysis.model_validate(analysis)


@router.get("/playthroughs/{playthrough_id}/review", response_model=PlaythroughReview)
async def review(playthrough_id: uuid.UUID, db: DB, session_id: SessionId) -> PlaythroughReview:
    playthrough, scenario = await _get_owned_playthrough(db, playthrough_id, session_id)
    turns = await _all_turns(db, playthrough.id)
    return PlaythroughReview(
        id=playthrough.id,
        scenario_id=scenario.id,
        scenario_title=_playthrough_title(playthrough, scenario.title),
        role_name=playthrough.role_name,
        status=playthrough.status,
        turns=[
            ReviewTurn(
                index=t.index,
                player_view=t.player_view,
                gm_state=t.gm_state,
                chosen_option_id=t.chosen_option_id,
                is_final=t.is_final,
                created_at=t.created_at,
            )
            for t in turns
        ],
        analysis=playthrough.analysis,
    )
