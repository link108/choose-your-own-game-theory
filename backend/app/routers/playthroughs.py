import uuid

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from app.deps import DB, SessionId
from app.models import Playthrough, Scenario, Turn
from app.routers.scenarios import get_owned_scenario
from app.schemas import (
    ChoiceRequest,
    PlaythroughDetail,
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


@router.post(
    "/scenarios/{scenario_id}/playthroughs", response_model=PlaythroughDetail, status_code=201
)
async def start_playthrough(
    scenario_id: uuid.UUID, body: StartPlaythroughRequest, db: DB, session_id: SessionId
) -> PlaythroughDetail:
    scenario = await get_owned_scenario(db, scenario_id, session_id)
    try:
        playthrough = await engine.start_playthrough(db, scenario, session_id, body.role_name)
    except engine.EngineError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    turns = await _all_turns(db, playthrough.id)
    return PlaythroughDetail(
        id=playthrough.id,
        scenario_id=scenario.id,
        scenario_title=scenario.title,
        role_name=playthrough.role_name,
        status=playthrough.status,
        turns=[_turn_out(t) for t in turns],
    )


@router.get("/scenarios/{scenario_id}/playthroughs", response_model=list[PlaythroughOut])
async def list_playthroughs(
    scenario_id: uuid.UUID, db: DB, session_id: SessionId
) -> list[PlaythroughOut]:
    await get_owned_scenario(db, scenario_id, session_id)
    rows = (
        await db.execute(
            select(Playthrough, func.count(Turn.id))
            .outerjoin(Turn, Turn.playthrough_id == Playthrough.id)
            .where(Playthrough.scenario_id == scenario_id)
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


@router.get("/playthroughs/{playthrough_id}", response_model=PlaythroughDetail)
async def get_playthrough(
    playthrough_id: uuid.UUID, db: DB, session_id: SessionId
) -> PlaythroughDetail:
    playthrough, scenario = await _get_owned_playthrough(db, playthrough_id, session_id)
    turns = await _all_turns(db, playthrough.id)
    return PlaythroughDetail(
        id=playthrough.id,
        scenario_id=scenario.id,
        scenario_title=scenario.title,
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
    return PlaythroughOut.model_validate(playthrough)


@router.get("/playthroughs/{playthrough_id}/review", response_model=PlaythroughReview)
async def review(
    playthrough_id: uuid.UUID, db: DB, session_id: SessionId
) -> PlaythroughReview:
    playthrough, scenario = await _get_owned_playthrough(db, playthrough_id, session_id)
    turns = await _all_turns(db, playthrough.id)
    return PlaythroughReview(
        id=playthrough.id,
        scenario_id=scenario.id,
        scenario_title=scenario.title,
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
    )
