"""Living scenarios: playthrough snapshots, admin gating, the news pass, and review flow."""

import json
import uuid

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.models import Playthrough
from tests.conftest import SCENARIO_BODY, turn_json

ARTICLES = [
    {
        "outlet": "BBC News",
        "lean": "international",
        "title": "Talks stall over strait transit rights",
        "summary": "Negotiations paused after naval incident.",
        "url": "https://example.org/bbc",
    },
    {
        "outlet": "Fox News",
        "lean": "right",
        "title": "Navy escorts resume through strait",
        "summary": "Escorted convoys restarted overnight.",
        "url": "https://example.org/fox",
    },
]


def living_draft_json(relevant=True, premise="UPDATED-PREMISE: escorts have resumed."):
    if not relevant:
        return json.dumps({"relevant": False})
    return json.dumps(
        {
            "relevant": True,
            "headline": "Escorted convoys resume as talks stall",
            "summary": "Outlets report escorted transits restarted while talks paused.",
            "changes": "The standoff has hardened; escort logistics are now in play.",
            "source_indices": [0, 1],
            "scenario": {**SCENARIO_BODY_CONTENT, "premise": premise},
        }
    )


# ScenarioContent shape: SCENARIO_BODY minus category
SCENARIO_BODY_CONTENT = {k: v for k, v in SCENARIO_BODY.items() if k != "category"}


@pytest_asyncio.fixture
async def admin_headers(client, auth_settings):
    res = await client.post(
        "/api/auth/register",
        json={"email": auth_settings.admin_email, "password": "password123"},
    )
    assert res.status_code == 201
    assert res.json()["user"]["role"] == "admin"
    return {"Authorization": f"Bearer {res.json()['token']}"}


@pytest.fixture
def fake_articles(monkeypatch):
    async def fetch():
        return list(ARTICLES), []

    monkeypatch.setattr("app.services.living.fetch_articles", fetch)


async def _create_scenario(client) -> str:
    res = await client.post("/api/scenarios", json=SCENARIO_BODY)
    assert res.status_code == 201
    return res.json()["id"]


async def _make_living(client, scenario_id, admin_headers) -> None:
    res = await client.post(
        f"/api/admin/scenarios/{scenario_id}/living",
        json={"is_living": True},
        headers=admin_headers,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["is_living"] is True
    assert body["is_library"] is True


# ---------------------------------------------------------------------------
# Snapshots: updates never shift a game in progress
# ---------------------------------------------------------------------------


async def test_playthrough_uses_snapshot_not_live_scenario(client, fake_chat):
    fake = fake_chat(turn_json())
    scenario_id = await _create_scenario(client)
    res = await client.post(
        f"/api/scenarios/{scenario_id}/playthroughs",
        json={"role_name": "Engineering Manager"},
    )
    assert res.status_code == 201
    playthrough_id = res.json()["id"]

    # the scenario changes after the game started
    res = await client.put(
        f"/api/scenarios/{scenario_id}",
        json={**SCENARIO_BODY, "premise": "COMPLETELY NEW PREMISE"},
    )
    assert res.status_code == 200

    res = await client.post(
        f"/api/playthroughs/{playthrough_id}/choice", json={"option_id": "opt-1"}
    )
    assert res.status_code == 200

    prompt = "".join(m["content"] for m in fake.calls[-1])
    assert SCENARIO_BODY["premise"] in prompt
    assert "COMPLETELY NEW PREMISE" not in prompt


async def test_current_and_previous_runs_remain_accessible_after_living_update(
    client, admin_headers, fake_articles, fake_chat
):
    updated_title = "Burnout on the Team: Talks Resume"
    update = json.loads(living_draft_json())
    update["scenario"]["title"] = updated_title
    fake_chat(
        turn_json(narrative="The original situation begins."),
        turn_json(
            narrative="The original situation ends.",
            options=[],
            is_final=True,
            epilogue="You brought the first situation to a close.",
        ),
        json.dumps(update),
        turn_json(narrative="The updated situation begins."),
    )

    scenario_id = await _create_scenario(client)
    await _make_living(client, scenario_id, admin_headers)

    old_run = (
        await client.post(
            f"/api/scenarios/{scenario_id}/playthroughs",
            json={"role_name": "Engineering Manager"},
        )
    ).json()
    res = await client.post(
        f"/api/playthroughs/{old_run['id']}/choice", json={"option_id": "opt-1"}
    )
    assert res.status_code == 200

    unfinished_run = (
        await client.post(
            f"/api/scenarios/{scenario_id}/playthroughs",
            json={"role_name": "Engineering Manager"},
        )
    ).json()

    assert (
        await client.post("/api/admin/living/run", headers=admin_headers, json={})
    ).status_code == 200
    drafts = (
        await client.get(
            "/api/admin/living/updates", params={"status": "draft"}, headers=admin_headers
        )
    ).json()
    assert len(drafts) == 1
    assert (
        await client.post(
            f"/api/admin/living/updates/{drafts[0]['id']}/approve", headers=admin_headers
        )
    ).status_code == 200

    current_run = (
        await client.post(
            f"/api/scenarios/{scenario_id}/playthroughs",
            json={"role_name": "Engineering Manager"},
        )
    ).json()

    res = await client.get("/api/me/playthroughs")
    assert res.status_code == 200
    runs = {run["id"]: run for run in res.json()}
    assert runs[old_run["id"]]["status"] == "completed"
    assert runs[old_run["id"]]["scenario_title"] == SCENARIO_BODY["title"]
    assert runs[unfinished_run["id"]]["status"] == "active"
    assert runs[unfinished_run["id"]]["scenario_title"] == SCENARIO_BODY["title"]
    assert runs[current_run["id"]]["status"] == "active"
    assert runs[current_run["id"]]["scenario_title"] == updated_title

    # Old and current-version routes remain directly usable after the live row changes.
    old_detail = (await client.get(f"/api/playthroughs/{old_run['id']}")).json()
    unfinished_detail = (await client.get(f"/api/playthroughs/{unfinished_run['id']}")).json()
    current_detail = (await client.get(f"/api/playthroughs/{current_run['id']}")).json()
    assert old_detail["scenario_title"] == SCENARIO_BODY["title"]
    assert unfinished_detail["status"] == "active"
    assert unfinished_detail["scenario_title"] == SCENARIO_BODY["title"]
    assert current_detail["scenario_title"] == updated_title
    assert (await client.get(f"/api/playthroughs/{old_run['id']}/review")).status_code == 200


async def test_pre_snapshot_playthrough_falls_back_to_live_scenario(client, db, fake_chat):
    fake = fake_chat(turn_json())
    scenario_id = await _create_scenario(client)
    res = await client.post(
        f"/api/scenarios/{scenario_id}/playthroughs",
        json={"role_name": "Engineering Manager"},
    )
    playthrough_id = res.json()["id"]

    # simulate a row created before the snapshot column existed
    playthrough = await db.scalar(
        select(Playthrough).where(Playthrough.id == uuid.UUID(playthrough_id))
    )
    playthrough.scenario_snapshot = None
    await db.commit()

    res = await client.post(
        f"/api/playthroughs/{playthrough_id}/choice", json={"option_id": "opt-1"}
    )
    assert res.status_code == 200
    prompt = "".join(m["content"] for m in fake.calls[-1])
    assert SCENARIO_BODY["premise"] in prompt


# ---------------------------------------------------------------------------
# Admin gating (role-based; token mechanics are covered in test_auth)
# ---------------------------------------------------------------------------


async def test_admin_requires_sign_in(client):
    res = await client.get("/api/admin/living/updates")
    assert res.status_code == 401


async def test_admin_rejects_regular_users(client, auth_settings):
    res = await client.post(
        "/api/auth/register", json={"email": "player@example.com", "password": "password123"}
    )
    headers = {"Authorization": f"Bearer {res.json()['token']}"}
    res = await client.get("/api/admin/living/updates", headers=headers)
    assert res.status_code == 403


async def test_admin_allows_admins(client, admin_headers):
    res = await client.get("/api/admin/living/updates", headers=admin_headers)
    assert res.status_code == 200


# ---------------------------------------------------------------------------
# The news pass and the review flow
# ---------------------------------------------------------------------------


async def test_run_creates_draft_and_approval_applies_it(
    client, admin_headers, fake_articles, fake_chat
):
    fake_chat(living_draft_json())
    scenario_id = await _create_scenario(client)
    await _make_living(client, scenario_id, admin_headers)

    res = await client.post("/api/admin/living/run", headers=admin_headers, json={})
    assert res.status_code == 200
    body = res.json()
    assert body["scenarios_checked"] == 1
    assert body["drafts_created"] == 1

    # the draft is queued for review, invisible to players, and nothing is applied yet
    res = await client.get(
        "/api/admin/living/updates", params={"status": "draft"}, headers=admin_headers
    )
    drafts = res.json()
    assert len(drafts) == 1
    draft = drafts[0]
    assert draft["scenario_id"] == scenario_id
    assert draft["proposed"]["premise"].startswith("UPDATED-PREMISE")
    assert draft["current"]["premise"] == SCENARIO_BODY["premise"]
    assert {s["outlet"] for s in draft["sources"]} == {"BBC News", "Fox News"}

    res = await client.get(f"/api/scenarios/{scenario_id}/updates")
    assert res.json() == []
    res = await client.get(f"/api/scenarios/{scenario_id}")
    assert res.json()["premise"] == SCENARIO_BODY["premise"]

    # approval applies the proposed content and publishes the log entry
    res = await client.post(
        f"/api/admin/living/updates/{draft['id']}/approve", headers=admin_headers
    )
    assert res.status_code == 200
    assert res.json()["status"] == "published"

    res = await client.get(f"/api/scenarios/{scenario_id}")
    assert res.json()["premise"].startswith("UPDATED-PREMISE")

    res = await client.get(f"/api/scenarios/{scenario_id}/updates")
    log = res.json()
    assert len(log) == 1
    assert log[0]["headline"] == "Escorted convoys resume as talks stall"
    assert log[0]["sources"][0]["lean"] == "international"


async def test_rejection_applies_nothing(client, admin_headers, fake_articles, fake_chat):
    fake_chat(living_draft_json())
    scenario_id = await _create_scenario(client)
    await _make_living(client, scenario_id, admin_headers)
    await client.post("/api/admin/living/run", headers=admin_headers, json={})

    res = await client.get(
        "/api/admin/living/updates", params={"status": "draft"}, headers=admin_headers
    )
    update_id = res.json()[0]["id"]
    res = await client.post(
        f"/api/admin/living/updates/{update_id}/reject", headers=admin_headers
    )
    assert res.status_code == 200
    assert res.json()["status"] == "rejected"

    res = await client.get(f"/api/scenarios/{scenario_id}")
    assert res.json()["premise"] == SCENARIO_BODY["premise"]
    res = await client.get(f"/api/scenarios/{scenario_id}/updates")
    assert res.json() == []
    # a reviewed update cannot be re-reviewed
    res = await client.post(
        f"/api/admin/living/updates/{update_id}/approve", headers=admin_headers
    )
    assert res.status_code == 400


async def test_pending_draft_blocks_another_run(
    client, admin_headers, fake_articles, fake_chat
):
    fake_chat(living_draft_json())
    scenario_id = await _create_scenario(client)
    await _make_living(client, scenario_id, admin_headers)

    await client.post("/api/admin/living/run", headers=admin_headers, json={})
    res = await client.post("/api/admin/living/run", headers=admin_headers, json={})
    body = res.json()
    assert body["drafts_created"] == 0
    assert body["skipped_pending_review"] == 1


async def test_irrelevant_news_creates_no_draft(
    client, admin_headers, fake_articles, fake_chat
):
    fake_chat(living_draft_json(relevant=False))
    scenario_id = await _create_scenario(client)
    await _make_living(client, scenario_id, admin_headers)

    res = await client.post("/api/admin/living/run", headers=admin_headers, json={})
    body = res.json()
    assert body["scenarios_checked"] == 1
    assert body["drafts_created"] == 0
    res = await client.get("/api/admin/living/updates", headers=admin_headers)
    assert res.json() == []
