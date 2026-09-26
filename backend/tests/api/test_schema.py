"""OpenAPI schema and documentation UI (T-00.5, RNF-MAN-002)."""

from rest_framework.test import APIClient


def test_openapi_schema_is_public_and_lists_health(api_client: APIClient) -> None:
    response = api_client.get("/api/v1/schema/", HTTP_ACCEPT="application/vnd.oai.openapi+json")

    assert response.status_code == 200
    assert "/api/v1/health/" in response.json()["paths"]


def test_documentation_ui_is_served(api_client: APIClient) -> None:
    response = api_client.get("/api/v1/docs/")

    assert response.status_code == 200
    assert b"swagger" in response.content.lower()
