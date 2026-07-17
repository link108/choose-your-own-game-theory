"""Seed the shared scenario library from the committed fixtures in app/seed_data/.

Run with: uv run python -m app.seed

Fixtures are produced by `python -m app.seed_generate` (from app/seed_catalog.py),
reviewed, and committed. Seeding is idempotent by title: new fixtures are inserted,
existing ones are updated in place, so fixture edits propagate on re-seed. All library
scenarios are owned by a well-known dev session and flagged is_library, which makes
them readable and playable by every session.
"""

import argparse
import asyncio
import json
import uuid
from pathlib import Path

from sqlalchemy import select

from app.db import SessionLocal
from app.models import AnonSession, Scenario

SEED_SESSION_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")
SEED_DATA_DIR = Path(__file__).parent / "seed_data"


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--category",
        action="append",
        default=[],
        help="seed only this category directory slug; may be repeated",
    )
    args = parser.parse_args()

    fixtures = sorted(SEED_DATA_DIR.glob("*/*.json"))
    if args.category:
        categories = set(args.category)
        fixtures = [path for path in fixtures if path.parent.name in categories]
    if not fixtures:
        print("no matching fixtures found")
        return

    async with SessionLocal() as db:
        if await db.scalar(select(AnonSession).where(AnonSession.id == SEED_SESSION_ID)) is None:
            db.add(AnonSession(id=SEED_SESSION_ID))

        existing = {
            s.title: s
            for s in await db.scalars(
                select(Scenario).where(Scenario.owner_session_id == SEED_SESSION_ID)
            )
        }
        created = updated = frozen = 0
        for path in fixtures:
            data = json.loads(path.read_text())
            scenario = existing.get(data["title"])
            if scenario is None:
                db.add(Scenario(owner_session_id=SEED_SESSION_ID, is_library=True, **data))
                created += 1
            elif scenario.is_living:
                # living scenarios evolve via approved updates; the fixture is only the
                # starting point and must never roll that evolution back
                frozen += 1
            else:
                for field, value in data.items():
                    setattr(scenario, field, value)
                scenario.is_library = True
                updated += 1
        await db.commit()

    print(
        f"library seeded: {created} created, {updated} updated, "
        f"{frozen} living (left untouched), {len(fixtures)} total"
    )
    print(f"To own these in the browser, set cookie: cyoa_session={SEED_SESSION_ID}")


if __name__ == "__main__":
    asyncio.run(main())
