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


async def make_library_scenario(session_maker, title="The Plea Bargain"):
    import uuid

    from app.models import AnonSession, Scenario

    async with session_maker() as db:
        owner = AnonSession(id=uuid.uuid4())
        db.add(owner)
        scenario = Scenario(
            owner_session_id=owner.id,
            is_library=True,
            category="Game Theory Classics",
            **{**SCENARIO_BODY, "title": title},
        )
        db.add(scenario)
        await db.commit()
        return str(scenario.id)


async def test_library_scenarios_are_readable_by_anyone(client, session_maker):
    scenario_id = await make_library_scenario(session_maker)

    listed = (await client.get("/api/scenarios/library")).json()
    assert [s["id"] for s in listed] == [scenario_id]
    assert listed[0]["category"] == "Game Theory Classics"
    assert listed[0]["is_library"] is True

    fetched = await client.get(f"/api/scenarios/{scenario_id}")
    assert fetched.status_code == 200

    # but they don't appear in the caller's own list and can't be edited or deleted
    assert (await client.get("/api/scenarios")).json() == []
    update = await client.put(f"/api/scenarios/{scenario_id}", json=SCENARIO_BODY)
    assert update.status_code == 404
    assert (await client.delete(f"/api/scenarios/{scenario_id}")).status_code == 404


async def test_library_scenarios_are_playable_by_anyone(client, session_maker, fake_chat):
    from tests.conftest import turn_json

    scenario_id = await make_library_scenario(session_maker)
    fake_chat(turn_json())

    res = await client.post(
        f"/api/scenarios/{scenario_id}/playthroughs",
        json={"role_name": SCENARIO_BODY["roles"][0]["name"]},
    )
    assert res.status_code == 201

    # playthrough lists on shared scenarios only show the caller's own runs
    from httpx import ASGITransport, AsyncClient

    from app.main import app

    mine = (await client.get(f"/api/scenarios/{scenario_id}/playthroughs")).json()
    assert len(mine) == 1
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as other:
        assert (await other.get(f"/api/scenarios/{scenario_id}/playthroughs")).json() == []


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
