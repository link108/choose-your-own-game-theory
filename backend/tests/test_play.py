from tests.conftest import SCENARIO_BODY, analysis_json, turn_json, validation_json

SECRET_MARKERS = ["SECRET-SCENE-SUMMARY", "SECRET-REASONING", "SECRET-FACT", "gm_state"]


async def _create_scenario(client) -> str:
    return (await client.post("/api/scenarios", json=SCENARIO_BODY)).json()["id"]


async def _start(client, scenario_id: str) -> dict:
    res = await client.post(
        f"/api/scenarios/{scenario_id}/playthroughs", json={"role_name": "Engineering Manager"}
    )
    assert res.status_code == 201, res.text
    return res.json()


async def test_start_playthrough_hides_gm_state(client, fake_chat):
    fake_chat(turn_json())
    scenario_id = await _create_scenario(client)
    pt = await _start(client, scenario_id)

    assert len(pt["turns"]) == 1
    options = pt["turns"][0]["player_view"]["options"]
    assert [o["id"] for o in options] == ["opt-1", "opt-2", "opt-3"]

    body = str(pt)
    for marker in SECRET_MARKERS:
        assert marker not in body, f"play response leaked {marker}"


async def test_unknown_role_rejected(client, fake_chat):
    fake_chat(turn_json())
    scenario_id = await _create_scenario(client)
    res = await client.post(
        f"/api/scenarios/{scenario_id}/playthroughs", json={"role_name": "Not A Role"}
    )
    assert res.status_code == 400


async def test_choice_advances_and_validates(client, fake_chat):
    fake_chat(turn_json())
    scenario_id = await _create_scenario(client)
    pt = await _start(client, scenario_id)

    bad = await client.post(f"/api/playthroughs/{pt['id']}/choice", json={"option_id": "opt-99"})
    assert bad.status_code == 400

    good = await client.post(f"/api/playthroughs/{pt['id']}/choice", json={"option_id": "opt-2"})
    assert good.status_code == 200
    turn = good.json()
    assert turn["index"] == 1
    for marker in SECRET_MARKERS:
        assert marker not in str(turn)

    detail = (await client.get(f"/api/playthroughs/{pt['id']}")).json()
    assert len(detail["turns"]) == 2
    assert detail["turns"][0]["chosen_option_id"] == "opt-2"


async def test_regenerate_bypasses_cache(client, fake_chat):
    fake = fake_chat(turn_json())
    scenario_id = await _create_scenario(client)
    pt = await _start(client, scenario_id)
    calls_before = len(fake.calls)

    res = await client.post(f"/api/playthroughs/{pt['id']}/regenerate")
    assert res.status_code == 200
    assert len(fake.calls) == calls_before + 1

    # a second regenerate bumps the nonce again — never a stale cache hit
    await client.post(f"/api/playthroughs/{pt['id']}/regenerate")
    assert len(fake.calls) == calls_before + 2


async def test_final_turn_completes_playthrough_and_review_reveals_all(client, fake_chat):
    fake_chat(
        turn_json(),
        turn_json(
            narrative="It ends.",
            options=[],
            is_final=True,
            epilogue="You kept Morgan and shipped on time.",
        ),
    )
    scenario_id = await _create_scenario(client)
    pt = await _start(client, scenario_id)

    final = (
        await client.post(f"/api/playthroughs/{pt['id']}/choice", json={"option_id": "opt-1"})
    ).json()
    assert final["is_final"] is True
    assert final["player_view"]["epilogue"].startswith("You kept")

    detail = (await client.get(f"/api/playthroughs/{pt['id']}")).json()
    assert detail["status"] == "completed"

    # no further choices allowed
    res = await client.post(f"/api/playthroughs/{pt['id']}/choice", json={"option_id": "opt-1"})
    assert res.status_code == 400

    review = (await client.get(f"/api/playthroughs/{pt['id']}/review")).json()
    body = str(review)
    assert "SECRET-SCENE-SUMMARY" in body
    assert "SECRET-REASONING" in body
    assert "SECRET-FACT" in body


async def test_options_carry_reasoning(client, fake_chat):
    fake_chat(turn_json())
    scenario_id = await _create_scenario(client)
    pt = await _start(client, scenario_id)

    options = pt["turns"][0]["player_view"]["options"]
    assert options[0]["reasoning"] == "Because: Ask directly"


async def test_suggest_action_accepted_and_choosable(client, fake_chat):
    fake_chat(
        turn_json(),
        validation_json(option_text="Invite Morgan for a walk", reasoning="Neutral ground."),
        turn_json(narrative="You walk together."),
    )
    scenario_id = await _create_scenario(client)
    pt = await _start(client, scenario_id)

    res = await client.post(
        f"/api/playthroughs/{pt['id']}/suggest-action",
        json={"text": "ask morgan to go for a walk"},
    )
    assert res.status_code == 200, res.text
    result = res.json()
    assert result["accepted"] is True

    options = result["turn"]["player_view"]["options"]
    assert len(options) == 4
    added = options[-1]
    assert added == {
        "id": "opt-4",
        "text": "Invite Morgan for a walk",
        "reasoning": "Neutral ground.",
        "custom": True,
    }
    for marker in SECRET_MARKERS:
        assert marker not in str(result)

    # the new option persists and can be chosen like any other
    good = await client.post(f"/api/playthroughs/{pt['id']}/choice", json={"option_id": "opt-4"})
    assert good.status_code == 200, good.text
    assert good.json()["index"] == 1


async def test_suggest_action_rejected(client, fake_chat):
    fake_chat(
        turn_json(),
        validation_json(valid=False, reason="You have no jetpack."),
    )
    scenario_id = await _create_scenario(client)
    pt = await _start(client, scenario_id)

    res = await client.post(
        f"/api/playthroughs/{pt['id']}/suggest-action", json={"text": "fly away on my jetpack"}
    )
    assert res.status_code == 200
    result = res.json()
    assert result["accepted"] is False
    assert result["reason"] == "You have no jetpack."
    assert len(result["turn"]["player_view"]["options"]) == 3


async def test_suggest_action_duplicate_rejected_without_llm(client, fake_chat):
    fake = fake_chat(turn_json())
    scenario_id = await _create_scenario(client)
    pt = await _start(client, scenario_id)
    calls_before = len(fake.calls)

    # duplicates an existing option verbatim — rejected before any LLM call
    res = await client.post(
        f"/api/playthroughs/{pt['id']}/suggest-action", json={"text": "ask directly"}
    )
    assert res.status_code == 400
    assert len(fake.calls) == calls_before


async def _play_to_completion(client, fake_chat) -> tuple[dict, object]:
    fake = fake_chat(
        turn_json(),
        turn_json(narrative="It ends.", options=[], is_final=True, epilogue="You shipped."),
        analysis_json(),
    )
    scenario_id = await _create_scenario(client)
    pt = await _start(client, scenario_id)
    await client.post(f"/api/playthroughs/{pt['id']}/choice", json={"option_id": "opt-1"})
    return pt, fake


async def test_analysis_requires_finished_playthrough(client, fake_chat):
    fake_chat(turn_json())
    scenario_id = await _create_scenario(client)
    pt = await _start(client, scenario_id)

    res = await client.post(f"/api/playthroughs/{pt['id']}/analysis")
    assert res.status_code == 400


async def test_analysis_generated_stored_and_idempotent(client, fake_chat):
    pt, fake = await _play_to_completion(client, fake_chat)

    res = await client.post(f"/api/playthroughs/{pt['id']}/analysis")
    assert res.status_code == 200, res.text
    analysis = res.json()
    assert analysis["outcome"].startswith("You kept Morgan")
    assert analysis["decisions"][0]["choice"] == "Ask directly"
    assert analysis["strengths"] and analysis["improvements"]
    calls_after_first = len(fake.calls)

    # the second request returns the stored analysis without another LLM call
    again = await client.post(f"/api/playthroughs/{pt['id']}/analysis")
    assert again.json() == analysis
    assert len(fake.calls) == calls_after_first

    # the review response carries the stored analysis
    review = (await client.get(f"/api/playthroughs/{pt['id']}/review")).json()
    assert review["analysis"] == analysis


async def test_analysis_prompt_sees_hidden_state_and_choices(client, fake_chat):
    pt, fake = await _play_to_completion(client, fake_chat)
    await client.post(f"/api/playthroughs/{pt['id']}/analysis")

    prompt = str(fake.calls[-1])
    assert "SECRET-FACT" in prompt
    assert "CHOSEN" in prompt


async def test_review_has_no_analysis_before_it_is_requested(client, fake_chat):
    pt, _ = await _play_to_completion(client, fake_chat)
    review = (await client.get(f"/api/playthroughs/{pt['id']}/review")).json()
    assert review["analysis"] is None


async def test_abandon(client, fake_chat):
    fake_chat(turn_json())
    scenario_id = await _create_scenario(client)
    pt = await _start(client, scenario_id)

    res = await client.post(f"/api/playthroughs/{pt['id']}/abandon")
    assert res.json()["status"] == "abandoned"

    res = await client.post(f"/api/playthroughs/{pt['id']}/choice", json={"option_id": "opt-1"})
    assert res.status_code == 400
