"""
Issue 01 — CI baseline tests.

These tests verify that the FastAPI application is importable and that the
health endpoint responds correctly. They require no database connection and
must pass in CI with zero external services running.
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_ok() -> None:
    """GET /health must return 200 with status=ok."""
    response = client.get("/health")
    assert response.status_code == 200


def test_health_response_body() -> None:
    """GET /health body must contain status and version keys."""
    response = client.get("/health")
    body = response.json()
    assert body["status"] == "ok"
    assert body["version"] == "1.1.0"


def test_openapi_schema_accessible() -> None:
    """OpenAPI schema endpoint must respond with 200."""
    response = client.get("/openapi.json")
    assert response.status_code == 200


def test_app_is_importable() -> None:
    """Smoke test: importing app.main must not raise."""
    from app.main import app as _app

    assert _app is not None
