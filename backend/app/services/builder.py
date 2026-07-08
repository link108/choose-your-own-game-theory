from sqlalchemy.ext.asyncio import AsyncSession

from app.prompts.builder import builder_prompt
from app.schemas import ScenarioDraft
from app.services import llm


async def draft_scenario(db: AsyncSession, concept: str, regen_nonce: int = 0) -> ScenarioDraft:
    system, user = builder_prompt(concept)
    return await llm.generate(
        db, "scenario_draft", system, user, ScenarioDraft, regen_nonce=regen_nonce
    )
