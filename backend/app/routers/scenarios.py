import uuid

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.deps import DB, SessionId
from app.models import Scenario
from app.schemas import DraftRequest, ScenarioDraft, ScenarioIn, ScenarioOut
from app.services import builder

router = APIRouter(prefix="/api/scenarios", tags=["scenarios"])


async def get_owned_scenario(db: DB, scenario_id: uuid.UUID, session_id: uuid.UUID) -> Scenario:
    scenario = await db.scalar(
        select(Scenario).where(
            Scenario.id == scenario_id, Scenario.owner_session_id == session_id
        )
    )
    if scenario is None:
        raise HTTPException(status_code=404, detail="scenario not found")
    return scenario


@router.post("/draft", response_model=ScenarioDraft)
async def draft_scenario(body: DraftRequest, db: DB, session_id: SessionId) -> ScenarioDraft:
    return await builder.draft_scenario(db, body.concept)


@router.post("", response_model=ScenarioOut, status_code=201)
async def create_scenario(body: ScenarioIn, db: DB, session_id: SessionId) -> Scenario:
    scenario = Scenario(
        owner_session_id=session_id,
        **body.model_dump(exclude={"roles", "npcs"}),
        roles=[r.model_dump() for r in body.roles],
        npcs=[n.model_dump() for n in body.npcs],
    )
    db.add(scenario)
    await db.commit()
    return scenario


@router.get("", response_model=list[ScenarioOut])
async def list_scenarios(db: DB, session_id: SessionId) -> list[Scenario]:
    result = await db.scalars(
        select(Scenario)
        .where(Scenario.owner_session_id == session_id)
        .order_by(Scenario.created_at.desc())
    )
    return list(result)


@router.get("/{scenario_id}", response_model=ScenarioOut)
async def get_scenario(scenario_id: uuid.UUID, db: DB, session_id: SessionId) -> Scenario:
    return await get_owned_scenario(db, scenario_id, session_id)


@router.put("/{scenario_id}", response_model=ScenarioOut)
async def update_scenario(
    scenario_id: uuid.UUID, body: ScenarioIn, db: DB, session_id: SessionId
) -> Scenario:
    scenario = await get_owned_scenario(db, scenario_id, session_id)
    for field, value in body.model_dump(exclude={"roles", "npcs"}).items():
        setattr(scenario, field, value)
    scenario.roles = [r.model_dump() for r in body.roles]
    scenario.npcs = [n.model_dump() for n in body.npcs]
    await db.commit()
    # updated_at is server-generated on UPDATE and expires on commit
    await db.refresh(scenario)
    return scenario


@router.delete("/{scenario_id}", status_code=204)
async def delete_scenario(scenario_id: uuid.UUID, db: DB, session_id: SessionId) -> None:
    scenario = await get_owned_scenario(db, scenario_id, session_id)
    await db.delete(scenario)
    await db.commit()
