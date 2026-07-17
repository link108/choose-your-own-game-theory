from itertools import groupby

from fastapi import APIRouter
from sqlalchemy import or_, select

from app.deps import DB, SessionId
from app.models import Scenario
from app.schemas import CatalogCategory, CatalogOut, ScenarioOut

router = APIRouter(prefix="/api", tags=["catalog"])


@router.get("/catalog", response_model=CatalogOut)
async def get_catalog(db: DB, session_id: SessionId) -> CatalogOut:
    """The shared catalog in one call: the featured shelf, live scenarios, and the
    library grouped by category — what a home/explore screen renders."""
    result = await db.scalars(
        select(Scenario)
        .where(or_(Scenario.is_library, Scenario.is_living))
        .order_by(Scenario.category, Scenario.title)
    )
    scenarios = [ScenarioOut.model_validate(s) for s in result]

    featured = sorted(
        (s for s in scenarios if s.featured_rank is not None), key=lambda s: s.featured_rank
    )
    live = sorted((s for s in scenarios if s.is_living), key=lambda s: s.updated_at, reverse=True)
    categories = [
        CatalogCategory(name=name, scenarios=list(group))
        for name, group in groupby((s for s in scenarios if s.is_library), key=lambda s: s.category)
    ]
    return CatalogOut(featured=featured, live=live, categories=categories)
