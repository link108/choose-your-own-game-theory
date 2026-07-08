from tests.conftest import SCENARIO_BODY, draft_json


async def test_scenario_crud_roundtrip(client):
    created = (await client.post("/api/scenarios", json=SCENARIO_BODY)).json()
    assert created["title"] == SCENARIO_BODY["title"]

    listed = (await client.get("/api/scenarios")).json()
    assert [s["id"] for s in listed] == [created["id"]]

    updated_body = {**SCENARIO_BODY, "title": "Renamed"}
    updated = (await client.put(f"/api/scenarios/{created['id']}", json=updated_body)).json()
    assert updated["title"] == "Renamed"

    assert (await client.delete(f"/api/scenarios/{created['id']}")).status_code == 204
    assert (await client.get(f"/api/scenarios/{created['id']}")).status_code == 404


async def test_scenarios_are_scoped_to_session(client, session_maker):
    from httpx import ASGITransport, AsyncClient

    from app.main import app

    created = (await client.post("/api/scenarios", json=SCENARIO_BODY)).json()

    # a second browser (no cookie jar shared) sees nothing
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as other:
        assert (await other.get("/api/scenarios")).json() == []
        assert (await other.get(f"/api/scenarios/{created['id']}")).status_code == 404


async def test_requires_at_least_one_role(client):
    body = {**SCENARIO_BODY, "roles": []}
    assert (await client.post("/api/scenarios", json=body)).status_code == 422


async def test_ai_draft(client, fake_chat):
    fake_chat(draft_json())
    res = await client.post("/api/scenarios/draft", json={"concept": "burnout EM training"})
    assert res.status_code == 200
    draft = res.json()
    assert draft["title"] == "Burnout on the Team"
    assert len(draft["roles"]) == 1
