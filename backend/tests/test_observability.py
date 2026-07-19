import uuid

import pytest
from prometheus_client import REGISTRY

from app.metrics import HTTP_SERVER_REQUESTS, SCENARIOS_CREATED
from tests.conftest import SCENARIO_BODY


def _sample_value(name: str, labels: dict[str, str] | None = None) -> float:
    return REGISTRY.get_sample_value(name, labels or {}) or 0.0


@pytest.mark.asyncio
async def test_metrics_endpoint_exposes_application_runtime_and_contract(client):
    await client.get("/api/health")

    response = await client.get("/metrics")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain")
    for metric_name in (
        "application_build_info",
        "http_server_requests_total",
        "http_server_request_duration_seconds",
        "database_query_duration_seconds",
        "python_info",
        "scenarios_created_total",
        "playthroughs_started_total",
    ):
        assert metric_name in response.text


@pytest.mark.asyncio
async def test_successful_request_increments_http_counter(client):
    labels = {"method": "GET", "route": "/api/health", "status_code": "200"}
    before = _sample_value("http_server_requests_total", labels)

    response = await client.get("/api/health")

    assert response.status_code == 200
    assert _sample_value("http_server_requests_total", labels) == before + 1


@pytest.mark.asyncio
async def test_error_increments_http_counter(client):
    labels = {"method": "GET", "route": "__unmatched__", "status_code": "404"}
    before = _sample_value("http_server_requests_total", labels)

    response = await client.get("/api/does-not-exist")

    assert response.status_code == 404
    assert _sample_value("http_server_requests_total", labels) == before + 1


@pytest.mark.asyncio
async def test_scenario_creation_increments_business_counter_after_commit(client):
    before = _sample_value("scenarios_created_total")

    response = await client.post("/api/scenarios", json=SCENARIO_BODY)

    assert response.status_code == 201
    assert _sample_value("scenarios_created_total") == before + 1


@pytest.mark.asyncio
async def test_playthrough_validation_error_increments_bounded_business_outcome(client):
    scenario_id = (await client.post("/api/scenarios", json=SCENARIO_BODY)).json()["id"]
    labels = {"outcome": "validation"}
    before = _sample_value("playthroughs_started_total", labels)

    response = await client.post(
        f"/api/scenarios/{scenario_id}/playthroughs", json={"role_name": "Not A Role"}
    )

    assert response.status_code == 400
    assert _sample_value("playthroughs_started_total", labels) == before + 1


@pytest.mark.asyncio
async def test_route_label_uses_template_not_resource_id(client):
    scenario_id = str(uuid.uuid4())
    labels = {
        "method": "GET",
        "route": "/api/scenarios/{scenario_id}",
        "status_code": "404",
    }
    before = _sample_value("http_server_requests_total", labels)

    response = await client.get(f"/api/scenarios/{scenario_id}")

    assert response.status_code == 404
    assert _sample_value("http_server_requests_total", labels) == before + 1
    assert all(
        scenario_id not in sample.labels.values()
        for sample in HTTP_SERVER_REQUESTS.collect()[0].samples
    )


def test_business_metric_has_no_entity_labels():
    assert SCENARIOS_CREATED._labelnames == ()
