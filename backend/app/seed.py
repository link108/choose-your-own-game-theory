"""Seed two sample scenarios owned by a well-known dev session.

Run with: uv run python -m app.seed
Prints the session cookie value to paste into your browser if you want to own the seeds.
"""

import asyncio
import uuid

from sqlalchemy import select

from app.db import SessionLocal
from app.models import AnonSession, Scenario

SEED_SESSION_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")

SCENARIOS = [
    dict(
        title="Burnout on the Line",
        premise=(
            "Two weeks before a critical launch, your strongest engineer has gone quiet, "
            "their review comments turned curt, and this morning they declined the sprint "
            "planning meeting without explanation."
        ),
        setting=(
            "A 40-person startup. You lead a team of six. The launch is contractually "
            "committed to your biggest customer."
        ),
        tone="corporate-realistic",
        goal=(
            "Understand what is going on with Morgan and get to launch without losing them. "
            "Success: Morgan stays engaged and the launch ships. Failure: Morgan resigns or "
            "the launch slips more than a week."
        ),
        gm_notes=(
            "Morgan has a competing offer with a deadline three days out and feels invisible "
            "since the player got promoted over them. Direct pressure backfires; genuine "
            "curiosity and concrete recognition help. The CTO will suggest just paying them "
            "more, which Morgan reads as missing the point."
        ),
        roles=[
            dict(
                name="Engineering Manager",
                description="Recently promoted to manage the team you were part of.",
                private_info=(
                    "You privately know the launch date cannot move: the CEO already "
                    "promised it on stage."
                ),
            ),
        ],
        npcs=[
            dict(
                name="Morgan",
                description="Senior engineer, quietly brilliant, owns the hardest subsystem.",
                hidden_agenda=(
                    "Has an offer from a competitor expiring in three days; feels passed "
                    "over and unseen."
                ),
            ),
            dict(
                name="Priya",
                description="Your CTO. Supportive but stretched thin.",
                hidden_agenda=(
                    "Believes retention is a money problem and will push a counter-offer."
                ),
            ),
        ],
    ),
    dict(
        title="The Ashen Crown",
        premise=(
            "The old king died without an heir, and the crown — said to choose its own "
            "bearer — has gone missing from the vault the night before the succession council."
        ),
        setting=(
            "Vharen, a rain-soaked mountain city ruled by three feuding guilds. Magic is "
            "real, licensed, and heavily taxed."
        ),
        tone="high-fantasy, intrigue-heavy",
        goal=(
            "Recover the crown before the council convenes at dusk tomorrow. Success: the "
            "crown is returned (or convincingly replaced). Failure: the city falls into "
            "open guild war."
        ),
        gm_notes=(
            "The crown was stolen by the vault's own warden, who believes the crown chose "
            "her. She is hiding in the undercity. The Gilded Hand guild knows and is "
            "blackmailing her. A convincing forgery exists in the Artificers' workshop."
        ),
        roles=[
            dict(
                name="Guild Investigator",
                description="A licensed mage-detective retained by the succession council.",
                private_info="Your license is suspended pending review; you're working anyway.",
            ),
            dict(
                name="Vault Apprentice",
                description="Junior warden of the royal vault, first to discover the theft.",
                private_info=(
                    "You forgot to seal the inner door last night. This might be your fault."
                ),
            ),
        ],
        npcs=[
            dict(
                name="Warden Ilse",
                description="Head warden of the vault, missing since dawn.",
                hidden_agenda=(
                    "She took the crown; it whispers to her that she is the rightful queen."
                ),
            ),
            dict(
                name="Master Corvin",
                description="Charming spokesman of the Gilded Hand guild.",
                hidden_agenda="Blackmailing Ilse; wants a puppet on the throne.",
            ),
        ],
    ),
]


async def main() -> None:
    async with SessionLocal() as db:
        if await db.scalar(select(AnonSession).where(AnonSession.id == SEED_SESSION_ID)) is None:
            db.add(AnonSession(id=SEED_SESSION_ID))

        existing = set(
            (
                await db.scalars(
                    select(Scenario.title).where(Scenario.owner_session_id == SEED_SESSION_ID)
                )
            ).all()
        )
        for data in SCENARIOS:
            if data["title"] not in existing:
                db.add(Scenario(owner_session_id=SEED_SESSION_ID, **data))
                print(f"seeded: {data['title']}")
            else:
                print(f"already present: {data['title']}")
        await db.commit()

    print(f"\nTo own these in the browser, set cookie: cyoa_session={SEED_SESSION_ID}")


if __name__ == "__main__":
    asyncio.run(main())
