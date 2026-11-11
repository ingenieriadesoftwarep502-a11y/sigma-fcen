"""Brute-force protection on the authentication endpoints (SAD section 7, throttling)."""

from typing import Any

import pytest
from django.conf import settings
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.views import LoginView, LogoutView, RefreshView, RegisterView

AUTH_URLS = [
    "/api/v1/auth/login/",
    "/api/v1/auth/register/",
    "/api/v1/auth/refresh/",
    "/api/v1/auth/logout/",
]


def test_auth_scope_rate_is_configured() -> None:
    rest: dict[str, Any] = settings.REST_FRAMEWORK
    assert rest["DEFAULT_THROTTLE_RATES"]["auth"] == "10/minute"


@pytest.mark.parametrize("view", [LoginView, RegisterView, RefreshView, LogoutView])
def test_auth_endpoints_use_the_auth_throttle_scope(view: type[APIView]) -> None:
    assert ScopedRateThrottle in view.throttle_classes
    assert getattr(view, "throttle_scope", None) == "auth"


@pytest.mark.django_db
@pytest.mark.parametrize("url", AUTH_URLS)
def test_auth_endpoints_return_429_once_the_scope_limit_is_reached(
    api_client: APIClient, monkeypatch: pytest.MonkeyPatch, url: str
) -> None:
    # THROTTLE_RATES is bound when DRF is imported, so override_settings would not reach it.
    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "auth", "2/minute")

    statuses = [api_client.post(url, {}, format="json").status_code for _ in range(3)]

    assert 429 not in statuses[:2]
    assert statuses[2] == 429
