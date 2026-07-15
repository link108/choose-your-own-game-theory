"""Daily living-scenarios pass, for the k8s CronJob (and manual runs).

Run with: uv run python -m app.living_run

Fetches the news feeds and drafts a ScenarioUpdate per living scenario when the story
moved. Drafts wait in the admin review UI (/admin); nothing goes live without approval.
Requires DEEPSEEK_API_KEY and the database. Exits non-zero when every feed failed, so a
broken run is visible as a failed Job.
"""

import asyncio
import sys

from app.db import SessionLocal
from app.services import living


async def main() -> int:
    async with SessionLocal() as db:
        result = await living.run_all(db)
    print(
        f"living pass: {result.scenarios_checked} scenario(s) checked, "
        f"{result.drafts_created} draft(s) created, "
        f"{result.skipped_pending_review} skipped awaiting review, "
        f"{result.articles_fetched} articles from feeds"
    )
    for error in result.errors:
        print(f"warning: {error}", file=sys.stderr)
    return 1 if result.articles_fetched == 0 else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
