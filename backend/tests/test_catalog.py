"""Shared catalog endpoint + the cross-scenario playthrough list."""

from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models import AnonSession, Scenario
from tests.conftest import SCENARIO_BODY, turn_json


async def _seed_scenario(db, title, **kw):
    session = AnonSession()
    db.add(session)
    await db.flush()
    scenario = Scenario(
        owner_session_id=session.id,
        title=title,
        roles=[{"name": "Player", "description": "", "private_info": ""}],
        **kw,
    )
    db.add(scenario)
    await db.commit()
    return scenario


async def test_catalog_features_groups_and_hides_private(client, db):
    await _seed_scenario(db, "Alpha", category="Diplomacy", is_library=True, featured_rank=1)
    await _seed_scenario(db, "Beta", category="Diplomacy", is_library=True)
    await _seed_scenario(db, "Crisis", is_living=True)  # curated live, off-library
    await _seed_scenario(db, "Private Draft")

    res = await client.get("/api/catalog")
    assert res.status_code == 200
    body = res.json()
    assert [s["title"] for s in body["featured"]] == ["Alpha"]
    assert [s["title"] for s in body["live"]] == ["Crisis"]
    assert {c["name"]: [s["title"] for s in c["scenarios"]] for c in body["categories"]} == {
        "Diplomacy": ["Alpha", "Beta"]
    }
    assert "Private Draft" not in str(body)


async def test_living_scenario_is_publicly_readable(client, db):
    crisis = await _seed_scenario(db, "Crisis", is_living=True)
    res = await client.get(f"/api/scenarios/{crisis.id}")
    assert res.status_code == 200
    assert res.json()["title"] == "Crisis"


async def test_my_playthroughs_lists_across_scenarios(client, fake_chat):
    fake_chat(turn_json())
    for title in ("First", "Second"):
        res = await client.post("/api/scenarios", json={**SCENARIO_BODY, "title": title})
        scenario_id = res.json()["id"]
        res = await client.post(
            f"/api/scenarios/{scenario_id}/playthroughs",
            json={"role_name": "Engineering Manager"},
        )
        assert res.status_code == 201

    res = await client.get("/api/me/playthroughs")
    assert res.status_code == 200
    body = res.json()
    assert {p["scenario_title"] for p in body} == {"First", "Second"}
    assert all(p["turn_count"] == 1 and p["status"] == "active" for p in body)

    # a different identity sees nothing
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as other:
        assert (await other.get("/api/me/playthroughs")).json() == []
