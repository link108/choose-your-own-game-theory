"""User stats, the cross-run progress insight, and the admin usage overview."""

import json

from tests.conftest import SCENARIO_BODY, turn_json


def progress_json():
    """A valid ScenarioProgress payload for the cross-run insight flow."""
    return json.dumps(
        {
            "trend": "Your second run resolved the standoff two turns faster.",
            "overall": "You favor direct conversation and it keeps working for you.",
            "patterns": ["You open every run by confronting Morgan immediately."],
            "strengths": ["You address problems head-on."],
            "improvements": ["Gather information before committing to a position."],
        }
    )


async def _create_scenario(client) -> str:
    res = await client.post("/api/scenarios", json=SCENARIO_BODY)
    assert res.status_code == 201
    return res.json()["id"]


async def _play_to_completion(client, scenario_id: str) -> str:
    """Start a run and take one choice that ends it (fake_chat must be queued with an
    opening turn and a final turn)."""
    res = await client.post(
        f"/api/scenarios/{scenario_id}/playthroughs", json={"role_name": "Engineering Manager"}
    )
    assert res.status_code == 201, res.text
    pt_id = res.json()["id"]
    res = await client.post(f"/api/playthroughs/{pt_id}/choice", json={"option_id": "opt-1"})
    assert res.status_code == 200, res.text
    assert res.json()["is_final"]
    return pt_id


FINAL_TURN = turn_json(
    narrative="It is settled.", options=[], is_final=True, epilogue="Morgan stays; you ship."
)


# ---------------------------------------------------------------------------
# User stats
# ---------------------------------------------------------------------------


async def test_stats_empty(client):
    res = await client.get("/api/me/stats")
    assert res.status_code == 200
    body = res.json()
    assert body["scenarios_tried"] == 0
    assert body["total_playthroughs"] == 0
    assert body["scenarios"] == []


async def test_stats_after_runs(client, fake_chat):
    fake_chat(turn_json(), FINAL_TURN)
    scenario_id = await _create_scenario(client)
    await _play_to_completion(client, scenario_id)

    # a second run left active (opening turn comes from the LLM cache)
    res = await client.post(
        f"/api/scenarios/{scenario_id}/playthroughs", json={"role_name": "Engineering Manager"}
    )
    assert res.status_code == 201

    body = (await client.get("/api/me/stats")).json()
    assert body["scenarios_tried"] == 1
    assert body["total_playthroughs"] == 2
    assert body["completed"] == 1
    assert body["active"] == 1
    # completed run has 2 turns, active run has 1
    assert body["total_turns"] == 3
    assert body["avg_turns"] == 1.5

    (row,) = body["scenarios"]
    assert row["title"] == SCENARIO_BODY["title"]
    assert row["attempts"] == 2
    assert row["completed"] == 1
    assert row["has_insight"] is False
    assert row["last_played_at"] is not None


async def test_stats_are_scoped_to_session(client, fake_chat):
    fake_chat(turn_json(), FINAL_TURN)
    scenario_id = await _create_scenario(client)
    await _play_to_completion(client, scenario_id)

    client.cookies.clear()
    body = (await client.get("/api/me/stats")).json()
    assert body["total_playthroughs"] == 0


# ---------------------------------------------------------------------------
# Cross-run progress insight
# ---------------------------------------------------------------------------


async def test_insight_requires_finished_run(client, fake_chat):
    fake_chat(turn_json())
    scenario_id = await _create_scenario(client)
    res = await client.post(
        f"/api/scenarios/{scenario_id}/playthroughs", json={"role_name": "Engineering Manager"}
    )
    assert res.status_code == 201

    res = await client.post(f"/api/scenarios/{scenario_id}/insight")
    assert res.status_code == 400
    assert "finish" in res.json()["detail"]


async def test_insight_lifecycle(client, fake_chat):
    fake = fake_chat(turn_json(), FINAL_TURN, progress_json())
    scenario_id = await _create_scenario(client)
    await _play_to_completion(client, scenario_id)

    # nothing generated yet
    res = await client.get(f"/api/scenarios/{scenario_id}/insight")
    assert res.status_code == 404

    res = await client.post(f"/api/scenarios/{scenario_id}/insight")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["runs_analyzed"] == 1
    assert body["insight"]["trend"].startswith("Your second run")
    assert body["insight"]["improvements"]

    # the progress prompt got the choice sequence, not raw gm_state
    prompt = fake.calls[-1][-1]["content"]
    assert "Choices in order" in prompt

    # stored: GET returns it, and it shows up on the stats page flag
    res = await client.get(f"/api/scenarios/{scenario_id}/insight")
    assert res.status_code == 200
    stats = (await client.get("/api/me/stats")).json()
    assert stats["scenarios"][0]["has_insight"] is True

    # regenerating with unchanged runs hits the LLM cache and keeps one row
    calls_before = len(fake.calls)
    res = await client.post(f"/api/scenarios/{scenario_id}/insight")
    assert res.status_code == 200
    assert len(fake.calls) == calls_before


async def test_insight_not_shared_between_sessions(client, fake_chat):
    fake_chat(turn_json(), FINAL_TURN, progress_json())
    scenario_id = await _create_scenario(client)
    await _play_to_completion(client, scenario_id)
    assert (await client.post(f"/api/scenarios/{scenario_id}/insight")).status_code == 200

    client.cookies.clear()
    # another session can't read this scenario at all (not library), let alone the insight
    res = await client.get(f"/api/scenarios/{scenario_id}/insight")
    assert res.status_code == 404


# ---------------------------------------------------------------------------
# Admin usage stats
# ---------------------------------------------------------------------------


async def _register(client, email, password="password123") -> dict:
    res = await client.post("/api/auth/register", json={"email": email, "password": password})
    assert res.status_code == 201
    return {"Authorization": f"Bearer {res.json()['token']}"}


async def test_admin_stats_gated(client, auth_settings):
    assert (await client.get("/api/admin/stats")).status_code == 401
    headers = await _register(client, "someone@example.com")
    assert (await client.get("/api/admin/stats", headers=headers)).status_code == 403


async def test_admin_stats_overview(client, fake_chat, auth_settings):
    fake_chat(turn_json(), FINAL_TURN)
    admin_headers = await _register(client, auth_settings.admin_email)

    # a guest (cookie session, separate from the admin's) creates and plays
    client.cookies.clear()
    scenario_id = await _create_scenario(client)
    await _play_to_completion(client, scenario_id)

    res = await client.get("/api/admin/stats", headers=admin_headers)
    assert res.status_code == 200
    body = res.json()

    totals = body["totals"]
    assert totals["users"] == 1
    assert totals["scenarios"] == 1
    assert totals["playthroughs"] == 1
    assert totals["completed"] == 1
    assert totals["total_turns"] == 2
    assert totals["llm_calls"] == 2  # opening turn + final turn

    # one guest row with the activity, plus the (inactive) admin row
    guests = [u for u in body["users"] if u["email"] is None]
    assert len(guests) == 1
    guest = guests[0]
    assert guest["playthroughs"] == 1
    assert guest["completed"] == 1
    assert guest["scenarios_created"] == 1
    assert guest["scenarios_tried"] == 1
    admin_row = next(u for u in body["users"] if u["email"] == auth_settings.admin_email)
    assert admin_row["role"] == "admin"
    assert admin_row["playthroughs"] == 0

    (scenario_row,) = body["scenarios"]
    assert scenario_row["title"] == SCENARIO_BODY["title"]
    assert scenario_row["players"] == 1
    assert scenario_row["attempts"] == 1
    assert scenario_row["avg_turns"] == 2.0

    # drill-down into the guest's per-scenario record
    res = await client.get(
        f"/api/admin/stats/sessions/{guest['session_id']}", headers=admin_headers
    )
    assert res.status_code == 200
    (row,) = res.json()
    assert row["scenario_id"] == scenario_id
    assert row["completed"] == 1
