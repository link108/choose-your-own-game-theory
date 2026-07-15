"""Admin endpoints for living scenarios: run the news pass, review drafts, promote
scenarios to living. Restricted to users with the admin role (see ADMIN_EMAIL)."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.deps import DB, require_admin
from app.models import Scenario, ScenarioUpdate
from app.schemas import (
    LivingRunResult,
    ScenarioContent,
    ScenarioOut,
    ScenarioUpdateAdminOut,
)
from app.services import living

router = APIRouter(
    prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)]
)


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
