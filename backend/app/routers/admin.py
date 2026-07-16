"""Admin endpoints: usage stats across all users, plus living scenarios (run the news
pass, review drafts, promote scenarios). Restricted to users with the admin role (see
ADMIN_EMAIL)."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select

from app.deps import DB, require_admin
from app.models import AnonSession, LLMCall, Playthrough, Scenario, ScenarioUpdate, Turn, User
from app.routers.stats import scenario_stats_for_session
from app.schemas import (
    AdminScenarioStats,
    AdminStats,
    AdminTotals,
    AdminUserStats,
    LivingRunResult,
    ScenarioContent,
    ScenarioOut,
    ScenarioStats,
    ScenarioUpdateAdminOut,
)
from app.services import living

router = APIRouter(
    prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)]
)


@router.get("/stats", response_model=AdminStats)
async def usage_stats(db: DB) -> AdminStats:
    """High-level overview of every identity's activity and every scenario's uptake.

    Aggregation happens in Python over one playthrough-level query — fine at this
    app's scale and much simpler than a lattice of GROUP BYs.
    """
    users = (await db.scalars(select(User))).all()
    user_by_session = {u.session_id: u for u in users}
    created_counts = dict(
        (
            await db.execute(
                select(Scenario.owner_session_id, func.count()).group_by(
                    Scenario.owner_session_id
                )
            )
        ).all()
    )

    rows = (
        await db.execute(
            select(Playthrough, Scenario, func.count(Turn.id))
            .join(Scenario, Scenario.id == Playthrough.scenario_id)
            .outerjoin(Turn, Turn.playthrough_id == Playthrough.id)
            .group_by(Playthrough.id, Scenario.id)
        )
    ).all()

    by_session: dict[uuid.UUID, AdminUserStats] = {}
    by_scenario: dict[uuid.UUID, AdminScenarioStats] = {}
    players: dict[uuid.UUID, set[uuid.UUID]] = {}
    tried: dict[uuid.UUID, set[uuid.UUID]] = {}
    status_totals = {"active": 0, "completed": 0, "abandoned": 0}
    total_turns = 0

    def session_row(session_id: uuid.UUID) -> AdminUserStats:
        row = by_session.get(session_id)
        if row is None:
            user = user_by_session.get(session_id)
            row = AdminUserStats(
                session_id=session_id,
                email=user.email if user else None,
                role=user.role if user else None,
                scenarios_created=created_counts.get(session_id, 0),
                scenarios_tried=0,
                playthroughs=0,
                active=0,
                completed=0,
                abandoned=0,
                total_turns=0,
                avg_turns=0.0,
            )
            by_session[session_id] = row
        return row

    for playthrough, scenario, turn_count in rows:
        if playthrough.status in status_totals:
            status_totals[playthrough.status] += 1
        total_turns += turn_count

        row = session_row(playthrough.owner_session_id)
        row.playthroughs += 1
        row.total_turns += turn_count
        if playthrough.status == "active":
            row.active += 1
        elif playthrough.status == "completed":
            row.completed += 1
        elif playthrough.status == "abandoned":
            row.abandoned += 1
        if row.last_active_at is None or playthrough.created_at > row.last_active_at:
            row.last_active_at = playthrough.created_at
        tried.setdefault(playthrough.owner_session_id, set()).add(scenario.id)

        stats = by_scenario.get(scenario.id)
        if stats is None:
            stats = AdminScenarioStats(
                scenario_id=scenario.id,
                title=scenario.title,
                is_library=scenario.is_library,
                is_living=scenario.is_living,
                players=0,
                attempts=0,
                completed=0,
                total_turns=0,
                avg_turns=0.0,
            )
            by_scenario[scenario.id] = stats
        stats.attempts += 1
        stats.total_turns += turn_count
        if playthrough.status == "completed":
            stats.completed += 1
        if stats.last_played_at is None or playthrough.created_at > stats.last_played_at:
            stats.last_played_at = playthrough.created_at
        players.setdefault(scenario.id, set()).add(playthrough.owner_session_id)

    # registered users appear even with zero activity; guests only once they play or create
    for user in users:
        session_row(user.session_id)
    for session_id in created_counts:
        session_row(session_id)

    for session_id, row in by_session.items():
        row.scenarios_tried = len(tried.get(session_id, ()))
        row.avg_turns = round(row.total_turns / row.playthroughs, 1) if row.playthroughs else 0.0
    for scenario_id, stats in by_scenario.items():
        stats.players = len(players.get(scenario_id, ()))
        stats.avg_turns = round(stats.total_turns / stats.attempts, 1)

    total_sessions = await db.scalar(select(func.count(AnonSession.id))) or 0
    totals = AdminTotals(
        users=len(users),
        guest_sessions=max(total_sessions - len(users), 0),
        scenarios=await db.scalar(select(func.count(Scenario.id))) or 0,
        playthroughs=sum(status_totals.values()),
        active=status_totals["active"],
        completed=status_totals["completed"],
        abandoned=status_totals["abandoned"],
        total_turns=total_turns,
        llm_calls=await db.scalar(select(func.count(LLMCall.id))) or 0,
    )

    def sort_key(row: AdminUserStats):
        return (row.last_active_at is not None, row.last_active_at, row.playthroughs)

    return AdminStats(
        totals=totals,
        users=sorted(by_session.values(), key=sort_key, reverse=True),
        scenarios=sorted(by_scenario.values(), key=lambda s: s.attempts, reverse=True),
    )


@router.get("/stats/sessions/{session_id}", response_model=list[ScenarioStats])
async def session_scenario_stats(session_id: uuid.UUID, db: DB) -> list[ScenarioStats]:
    """Per-scenario breakdown for one identity — the drill-down under a user row."""
    return await scenario_stats_for_session(db, session_id)


class RunRequest(BaseModel):
    scenario_id: uuid.UUID | None = None


@router.post("/living/run", response_model=LivingRunResult)
async def run_living_pass(db: DB, body: RunRequest | None = None) -> LivingRunResult:
    scenario_id = body.scenario_id if body else None
    return await living.run_all(db, scenario_id=scenario_id)


async def _get_update(db: DB, update_id: uuid.UUID) -> tuple[ScenarioUpdate, Scenario]:
    update = await db.get(ScenarioUpdate, update_id)
    if update is None:
        raise HTTPException(status_code=404, detail="update not found")
    scenario = await db.get(Scenario, update.scenario_id)
    return update, scenario


def _admin_out(update: ScenarioUpdate, scenario: Scenario) -> ScenarioUpdateAdminOut:
    return ScenarioUpdateAdminOut(
        id=update.id,
        scenario_id=update.scenario_id,
        scenario_title=scenario.title,
        status=update.status,
        headline=update.headline,
        summary=update.summary,
        changes=update.changes,
        sources=update.sources,
        proposed=ScenarioContent.model_validate(update.proposed),
        current=ScenarioContent.model_validate(scenario),
        created_at=update.created_at,
        reviewed_at=update.reviewed_at,
    )


@router.get("/living/updates", response_model=list[ScenarioUpdateAdminOut])
async def list_updates(db: DB, status: str | None = None) -> list[ScenarioUpdateAdminOut]:
    query = select(ScenarioUpdate, Scenario).join(
        Scenario, Scenario.id == ScenarioUpdate.scenario_id
    )
    if status:
        query = query.where(ScenarioUpdate.status == status)
    rows = (await db.execute(query.order_by(ScenarioUpdate.created_at.desc()))).all()
    return [_admin_out(update, scenario) for update, scenario in rows]


@router.post("/living/updates/{update_id}/approve", response_model=ScenarioUpdateAdminOut)
async def approve_update(update_id: uuid.UUID, db: DB) -> ScenarioUpdateAdminOut:
    update, scenario = await _get_update(db, update_id)
    if update.status != "draft":
        raise HTTPException(status_code=400, detail=f"update is already {update.status}")
    proposed = ScenarioContent.model_validate(update.proposed)
    for field, value in proposed.model_dump().items():
        setattr(scenario, field, value)
    update.status = "published"
    update.reviewed_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(scenario)
    return _admin_out(update, scenario)


@router.post("/living/updates/{update_id}/reject", response_model=ScenarioUpdateAdminOut)
async def reject_update(update_id: uuid.UUID, db: DB) -> ScenarioUpdateAdminOut:
    update, scenario = await _get_update(db, update_id)
    if update.status != "draft":
        raise HTTPException(status_code=400, detail=f"update is already {update.status}")
    update.status = "rejected"
    update.reviewed_at = datetime.now(UTC)
    await db.commit()
    return _admin_out(update, scenario)


class SetLivingRequest(BaseModel):
    is_living: bool


@router.post("/scenarios/{scenario_id}/living", response_model=ScenarioOut)
async def set_living(scenario_id: uuid.UUID, body: SetLivingRequest, db: DB) -> Scenario:
    """Promote a scenario to living (which also shares it in the library) or demote it.

    Demoting keeps the scenario and its published log; the daily pass just stops
    proposing updates for it.
    """
    scenario = await db.get(Scenario, scenario_id)
    if scenario is None:
        raise HTTPException(status_code=404, detail="scenario not found")
    scenario.is_living = body.is_living
    if body.is_living:
        scenario.is_library = True
    await db.commit()
    await db.refresh(scenario)
    return scenario
