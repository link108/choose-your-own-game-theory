"""Daily living-scenarios pass, for the k8s CronJob (and manual runs).

Run with: uv run python -m app.living_run

Fetches the news feeds and, per living scenario, drafts and immediately publishes a
ScenarioUpdate when the story moved — no admin approval gates it. The /admin review UI
shows the resulting history and is a manual fallback for a stale draft row, not the
normal path. Requires DEEPSEEK_API_KEY and the database. Exits non-zero when every feed
failed, so a broken run is visible as a failed Job.
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
        f"{result.drafts_created} update(s) published, "
        f"{result.stale_drafts_published} stale draft(s) published, "
        f"{result.articles_fetched} articles from feeds"
    )
    for error in result.errors:
        print(f"warning: {error}", file=sys.stderr)
    return 1 if result.articles_fetched == 0 else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
