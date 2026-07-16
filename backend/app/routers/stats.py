"""Player-facing metrics: overall usage for the current identity (user or guest
session), per-scenario records, and the cross-run progress insight."""

import uuid

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import DB, SessionId
from app.models import Playthrough, Scenario, ScenarioInsight, Turn
from app.routers.scenarios import get_readable_scenario
from app.schemas import ScenarioInsightOut, ScenarioProgress, ScenarioStats, UserStats
from app.services import engine
from app.services.llm import LLMError

router = APIRouter(prefix="/api", tags=["stats"])


async def scenario_stats_for_session(
    db: AsyncSession, session_id: uuid.UUID
) -> list[ScenarioStats]:
    """Per-scenario aggregates for one identity; also used by the admin drill-down."""
    rows = (
        await db.execute(
            select(Playthrough, Scenario.title, func.count(Turn.id))
            .join(Scenario, Scenario.id == Playthrough.scenario_id)
            .outerjoin(Turn, Turn.playthrough_id == Playthrough.id)
            .where(Playthrough.owner_session_id == session_id)
            .group_by(Playthrough.id, Scenario.title)
        )
    ).all()
    insight_ids = set(
        (
            await db.scalars(
                select(ScenarioInsight.scenario_id).where(
                    ScenarioInsight.owner_session_id == session_id
                )
            )
        ).all()
    )

    by_scenario: dict[uuid.UUID, ScenarioStats] = {}
    for playthrough, title, turn_count in rows:
        stats = by_scenario.get(playthrough.scenario_id)
        if stats is None:
            stats = ScenarioStats(
                scenario_id=playthrough.scenario_id,
                title=title,
                attempts=0,
                active=0,
                completed=0,
                abandoned=0,
                total_turns=0,
                avg_turns=0.0,
                has_insight=playthrough.scenario_id in insight_ids,
            )
            by_scenario[playthrough.scenario_id] = stats
        stats.attempts += 1
        stats.total_turns += turn_count
        if playthrough.status == "active":
            stats.active += 1
        elif playthrough.status == "completed":
            stats.completed += 1
        elif playthrough.status == "abandoned":
            stats.abandoned += 1
        if stats.last_played_at is None or playthrough.created_at > stats.last_played_at:
            stats.last_played_at = playthrough.created_at

    for stats in by_scenario.values():
        stats.avg_turns = round(stats.total_turns / stats.attempts, 1)
    return sorted(
        by_scenario.values(),
        key=lambda s: (s.last_played_at is not None, s.last_played_at),
        reverse=True,
    )


@router.get("/me/stats", response_model=UserStats)
async def my_stats(db: DB, session_id: SessionId) -> UserStats:
    scenarios = await scenario_stats_for_session(db, session_id)
    total = sum(s.attempts for s in scenarios)
    total_turns = sum(s.total_turns for s in scenarios)
    return UserStats(
        scenarios_tried=len(scenarios),
        total_playthroughs=total,
        active=sum(s.active for s in scenarios),
        completed=sum(s.completed for s in scenarios),
        abandoned=sum(s.abandoned for s in scenarios),
        total_turns=total_turns,
        avg_turns=round(total_turns / total, 1) if total else 0.0,
        scenarios=scenarios,
    )


def _insight_out(insight: ScenarioInsight) -> ScenarioInsightOut:
    return ScenarioInsightOut(
        scenario_id=insight.scenario_id,
        runs_analyzed=insight.runs_analyzed,
        insight=ScenarioProgress.model_validate(insight.insight),
        generated_at=insight.updated_at,
    )


@router.get("/scenarios/{scenario_id}/insight", response_model=ScenarioInsightOut)
async def get_insight(
    scenario_id: uuid.UUID, db: DB, session_id: SessionId
) -> ScenarioInsightOut:
    await get_readable_scenario(db, scenario_id, session_id)
    insight = await db.scalar(
        select(ScenarioInsight).where(
            ScenarioInsight.scenario_id == scenario_id,
            ScenarioInsight.owner_session_id == session_id,
        )
    )
    if insight is None:
        raise HTTPException(status_code=404, detail="no progress insight yet")
    return _insight_out(insight)


@router.post("/scenarios/{scenario_id}/insight", response_model=ScenarioInsightOut)
async def generate_insight(
    scenario_id: uuid.UUID, db: DB, session_id: SessionId
) -> ScenarioInsightOut:
    scenario = await get_readable_scenario(db, scenario_id, session_id)
    try:
        insight = await engine.analyze_progress(db, scenario, session_id)
    except engine.EngineError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return _insight_out(insight)
