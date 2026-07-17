"""The committed OpenAPI snapshot is the contract clients generate from — keep it
current, and keep operation ids (route names) unique so generated methods are stable."""

from app.main import app
from app.openapi_export import DEFAULT_PATH, render


def test_openapi_snapshot_is_current():
    assert DEFAULT_PATH.exists(), "openapi.json is missing — run `just openapi`"
    assert DEFAULT_PATH.read_text() == render(), "openapi.json is stale — run `just openapi`"


def test_operation_ids_are_unique():
    ids = [
        op["operationId"]
        for methods in app.openapi()["paths"].values()
        for op in methods.values()
        if isinstance(op, dict) and "operationId" in op
    ]
    assert len(ids) == len(set(ids)), sorted(ids)
