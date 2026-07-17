import json
from pathlib import Path

from app.schemas import ScenarioIn


def test_health_seed_scenarios_are_context_enabled_and_deidentified():
    root = Path(__file__).parents[1] / "app" / "seed_data" / "health-conversations"
    fixtures = sorted(root.glob("*.json"))
    assert len(fixtures) >= 2

    for path in fixtures:
        data = json.loads(path.read_text())
        scenario = ScenarioIn.model_validate(data)
        assert scenario.context_enabled is True
        assert scenario.risk_domain == "health"
        assert "DeepSeek" in scenario.context_disclaimer
        assert "de-identified" in scenario.context_prompt
        assert "not" in scenario.context_disclaimer.lower()
