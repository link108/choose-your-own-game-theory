"""Expand the seed catalog into full scenario fixtures via the AI builder.

Run with: uv run python -m app.seed_generate [--force]

For each (title, concept) in app.seed_catalog.CATALOG this calls the same builder that
powers the "draft it with AI" button and writes the result to
app/seed_data/<category-slug>/<title-slug>.json. Existing fixtures are skipped (they may
carry manual edits) unless --force is given. Requires DEEPSEEK_API_KEY and the dev db,
but reruns are cheap: identical prompts hit the llm_calls cache.

Fixtures are meant to be reviewed and committed; `python -m app.seed` loads them.
"""

import argparse
import asyncio
import json
import re
from pathlib import Path

from app.db import SessionLocal
from app.seed_catalog import CATALOG
from app.services import builder

SEED_DATA_DIR = Path(__file__).parent / "seed_data"
CONCURRENCY = 4


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def fixture_path(category: str, title: str) -> Path:
    return SEED_DATA_DIR / slugify(category) / f"{slugify(title)}.json"


async def generate_one(
    sem: asyncio.Semaphore, category: str, title: str, concept: str
) -> bool:
    async with sem:
        try:
            # each task needs its own session: AsyncSession is not concurrency-safe
            async with SessionLocal() as db:
                draft = await builder.draft_scenario(db, f'Title: "{title}". {concept}')
        except Exception as exc:  # noqa: BLE001 - report and keep generating the rest
            print(f"FAILED  {title}: {exc}")
            return False
    # keep the curated title: seeding is idempotent by title
    data = {"title": title, "category": category, **draft.model_dump(exclude={"title"})}
    path = fixture_path(category, title)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote   {path.relative_to(SEED_DATA_DIR)}")
    return True


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--force", action="store_true", help="regenerate fixtures that already exist"
    )
    args = parser.parse_args()

    sem = asyncio.Semaphore(CONCURRENCY)
    tasks = []
    skipped = 0
    for category, entries in CATALOG.items():
        for title, concept in entries:
            if fixture_path(category, title).exists() and not args.force:
                skipped += 1
                continue
            tasks.append(generate_one(sem, category, title, concept))

    results = await asyncio.gather(*tasks)
    failed = sum(1 for ok in results if not ok)
    print(
        f"\ndone: {len(results) - failed} generated, {skipped} already present, {failed} failed"
    )
    if failed:
        print("rerun to retry failures (successful generations are cached)")


if __name__ == "__main__":
    asyncio.run(main())
