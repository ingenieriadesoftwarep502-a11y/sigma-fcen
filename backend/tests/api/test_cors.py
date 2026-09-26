"""CORS whitelist driven by CORS_ALLOWED_ORIGINS (T-00.5)."""

from django.test import override_settings
from rest_framework.test import APIClient

ALLOWED_ORIGIN = "http://allowed.example.org"


@override_settings(CORS_ALLOWED_ORIGINS=[ALLOWED_ORIGIN])
def test_whitelisted_origin_receives_cors_header(api_client: APIClient) -> None:
    response = api_client.options(
        "/api/v1/health/",
        HTTP_ORIGIN=ALLOWED_ORIGIN,
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="GET",
    )

    assert response.headers.get("Access-Control-Allow-Origin") == ALLOWED_ORIGIN


@override_settings(CORS_ALLOWED_ORIGINS=[ALLOWED_ORIGIN])
def test_unknown_origin_receives_no_cors_header(api_client: APIClient) -> None:
    response = api_client.options(
        "/api/v1/health/",
        HTTP_ORIGIN="http://evil.example.org",
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="GET",
    )

    assert "Access-Control-Allow-Origin" not in response.headers
