"""Living scenarios: the daily news pass.

`run_all` fetches headlines from a politically balanced set of RSS feeds, then asks the
LLM, per living scenario, whether the story moved and how the scenario should change.
A relevant result is applied to the live scenario and published immediately (see
`apply_update`) — the admin review UI (routers/admin.py) is a history/audit view, not a
gate, since nobody was reliably checking it before a story went stale.
"""

import asyncio
import html
import logging
import re
import time
from datetime import UTC, datetime

import feedparser
import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.metrics import (
    BACKGROUND_JOB_DURATION,
    BACKGROUND_JOBS,
    LIVING_SCENARIO_UPDATES,
    observe_dependency,
)
from app.models import Scenario, ScenarioUpdate
from app.prompts.living import living_update_prompt
from app.schemas import LivingRunResult, LivingUpdateDraft, ScenarioContent
from app.services import llm

logger = logging.getLogger(__name__)

# Balanced across US-political lean and international perspective; each update's sources
# are stored with the lean so players can see what informed it.
FEEDS: list[dict] = [
    {
        "outlet": "BBC News",
        "lean": "international",
        "url": "https://feeds.bbci.co.uk/news/world/rss.xml",
    },
    {
        "outlet": "Al Jazeera",
        "lean": "international",
        "url": "https://www.aljazeera.com/xml/rss/all.xml",
    },
    {
        "outlet": "Deutsche Welle",
        "lean": "international",
        "url": "https://rss.dw.com/rdf/rss-en-world",
    },
    {"outlet": "The Guardian", "lean": "left", "url": "https://www.theguardian.com/world/rss"},
    {"outlet": "NPR", "lean": "center-left", "url": "https://feeds.npr.org/1004/rss.xml"},
    {"outlet": "CBS News", "lean": "center", "url": "https://www.cbsnews.com/latest/rss/world"},
    {
        "outlet": "Fox News",
        "lean": "right",
        "url": "https://moxie.foxnews.com/google-publisher/world.xml",
    },
    {"outlet": "New York Post", "lean": "right", "url": "https://nypost.com/world-news/feed/"},
]

MAX_PER_FEED = 15
MAX_SUMMARY_CHARS = 400
RECENT_UPDATES_IN_PROMPT = 5

_TAG_RE = re.compile(r"<[^>]+>")


def _clean(text: str) -> str:
    return html.unescape(_TAG_RE.sub("", text or "")).strip()


def _parse_feed(feed: dict, body: bytes) -> list[dict]:
    parsed = feedparser.parse(body)
    articles = []
    for entry in parsed.entries[:MAX_PER_FEED]:
        title = _clean(getattr(entry, "title", ""))
        if not title:
            continue
        articles.append(
            {
                "outlet": feed["outlet"],
                "lean": feed["lean"],
                "title": title,
                "summary": _clean(getattr(entry, "summary", ""))[:MAX_SUMMARY_CHARS],
                "url": getattr(entry, "link", ""),
            }
        )
    return articles


async def fetch_articles() -> tuple[list[dict], list[str]]:
    """Fetch every configured feed; returns (articles, per-feed error messages).

    A failed feed is reported and skipped — one broken outlet must not stop the run.
    """

    async def fetch_feed(client: httpx.AsyncClient, url: str):
        started_at = time.perf_counter()
        try:
            response = await client.get(url)
        except Exception:
            observe_dependency("news_feeds", "fetch_feed", "error", started_at)
            raise
        outcome = "success" if response.status_code == 200 else "error"
        observe_dependency("news_feeds", "fetch_feed", outcome, started_at)
        return response

    async with httpx.AsyncClient(
        timeout=20.0, follow_redirects=True, headers={"User-Agent": "cyoa-living/1.0"}
    ) as client:
        responses = await asyncio.gather(
            *(fetch_feed(client, feed["url"]) for feed in FEEDS), return_exceptions=True
        )

    articles: list[dict] = []
    errors: list[str] = []
    for feed, response in zip(FEEDS, responses, strict=True):
        if isinstance(response, BaseException):
            errors.append(f"{feed['outlet']}: {response}")
            continue
        if response.status_code != 200:
            errors.append(f"{feed['outlet']}: HTTP {response.status_code}")
            continue
        # feedparser is sync CPU work; keep the event loop free
        parsed = await asyncio.to_thread(_parse_feed, feed, response.content)
        if not parsed:
            errors.append(f"{feed['outlet']}: feed parsed to zero articles")
        articles.extend(parsed)
    return articles, errors


async def _recent_published(db: AsyncSession, scenario_id) -> list[dict]:
    rows = (
        await db.scalars(
            select(ScenarioUpdate)
            .where(
                ScenarioUpdate.scenario_id == scenario_id,
                ScenarioUpdate.status == "published",
            )
            .order_by(ScenarioUpdate.created_at.desc())
            .limit(RECENT_UPDATES_IN_PROMPT)
        )
    ).all()
    return [
        {
            "created_at": row.created_at.date().isoformat() if row.created_at else "",
            "headline": row.headline,
            "summary": row.summary,
        }
        for row in reversed(rows)
    ]


async def apply_update(db: AsyncSession, update: ScenarioUpdate, scenario: Scenario) -> None:
    """Copy a drafted update's proposed content onto its scenario and mark it published.

    Caller commits. Shared by the auto-publish path below and the admin approve/reject
    endpoints, which stay in place as a manual fallback for the rare stale "draft" row
    (e.g. one left over from a run that crashed mid-way).
    """
    proposed = ScenarioContent.model_validate(update.proposed)
    for field, value in proposed.model_dump().items():
        setattr(scenario, field, value)
    update.status = "published"
    update.reviewed_at = datetime.now(UTC)


async def run_for_scenario(
    db: AsyncSession, scenario: Scenario, articles: list[dict]
) -> ScenarioUpdate | None:
    """Draft and immediately publish an update for one living scenario, or None when the
    news didn't move."""
    content = ScenarioContent.model_validate(scenario)
    recent = await _recent_published(db, scenario.id)
    # a rejected draft must not be replayed from the LLM cache on the next run
    nonce = await db.scalar(
        select(func.count())
        .select_from(ScenarioUpdate)
        .where(ScenarioUpdate.scenario_id == scenario.id, ScenarioUpdate.status == "rejected")
    )

    system, user = living_update_prompt(content, recent, articles)
    draft = await llm.generate(
        db, "living_update", system, user, LivingUpdateDraft, regen_nonce=nonce
    )
    if not draft.relevant:
        LIVING_SCENARIO_UPDATES.labels("no_change").inc()
        return None

    sources = [
        {
            "outlet": articles[i]["outlet"],
            "lean": articles[i]["lean"],
            "title": articles[i]["title"],
            "url": articles[i]["url"],
        }
        for i in draft.source_indices
        if 0 <= i < len(articles)
    ]
    update = ScenarioUpdate(
        scenario_id=scenario.id,
        status="draft",
        headline=draft.headline,
        summary=draft.summary,
        changes=draft.changes,
        sources=sources,
        proposed=draft.scenario.model_dump(),
    )
    db.add(update)
    await apply_update(db, update, scenario)
    await db.commit()
    LIVING_SCENARIO_UPDATES.labels("published").inc()
    return update


async def run_all(db: AsyncSession, scenario_id=None) -> LivingRunResult:
    """The daily pass: one draft at most per living scenario, published immediately.

    A stale "draft" row (left over from before auto-publish, or a run that crashed
    between creating the row and applying it) is published outright instead of blocking
    the scenario forever; that scenario is picked up for today's news on the next run.
    """
    started_at = time.perf_counter()
    try:
        query = select(Scenario).where(Scenario.is_living)
        if scenario_id is not None:
            query = query.where(Scenario.id == scenario_id)
        scenarios = (await db.scalars(query.order_by(Scenario.title))).all()

        articles, errors = await fetch_articles()
        result = LivingRunResult(
            scenarios_checked=0,
            drafts_created=0,
            stale_drafts_published=0,
            articles_fetched=len(articles),
            errors=errors,
        )
        if not articles:
            result.errors.append("no articles fetched — skipping the LLM pass")
            outcome = "failure"
            return result

        for scenario in scenarios:
            stale = await db.scalar(
                select(ScenarioUpdate)
                .where(
                    ScenarioUpdate.scenario_id == scenario.id,
                    ScenarioUpdate.status == "draft",
                )
                .limit(1)
            )
            if stale is not None:
                await apply_update(db, stale, scenario)
                await db.commit()
                result.stale_drafts_published += 1
                continue
            result.scenarios_checked += 1
            try:
                update = await run_for_scenario(db, scenario, articles)
            except llm.LLMError as exc:
                logger.exception("living update failed for %s", scenario.title)
                result.errors.append(f"{scenario.title}: {exc}")
                LIVING_SCENARIO_UPDATES.labels("failed").inc()
                continue
            if update is not None:
                result.drafts_created += 1
        outcome = "partial_failure" if result.errors else "success"
        return result
    except Exception:
        outcome = "failure"
        raise
    finally:
        BACKGROUND_JOBS.labels("living_scenario_update", outcome).inc()
        BACKGROUND_JOB_DURATION.labels("living_scenario_update").observe(
            time.perf_counter() - started_at
        )
