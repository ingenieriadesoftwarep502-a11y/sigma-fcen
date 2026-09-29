"""REST framework defaults that protect every future endpoint (T-00.5)."""

from typing import Any

from django.conf import settings
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from shared.pagination import DefaultPagination


def test_adr_007_cookie_jwt_is_the_only_default_scheme() -> None:
    # JWT in HttpOnly cookies (ADR-007); no header, session or basic auth fallback.
    assert settings.REST_FRAMEWORK["DEFAULT_AUTHENTICATION_CLASSES"] == [
        "apps.accounts.authentication.CookieJWTAuthentication",
    ]


def test_anonymous_and_user_throttling_are_enabled() -> None:
    rest: dict[str, Any] = settings.REST_FRAMEWORK

    assert rest["DEFAULT_THROTTLE_CLASSES"] == [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ]
    assert set(rest["DEFAULT_THROTTLE_RATES"]) == {"anon", "user", "auth"}


def test_default_pagination_caps_page_size_at_100() -> None:
    request = APIRequestFactory().get("/items/", {"page_size": 500})
    paginator = DefaultPagination()
    page = paginator.paginate_queryset(list(range(1000)), Request(request))

    assert page is not None
    assert len(page) == 100
    assert settings.REST_FRAMEWORK["DEFAULT_PAGINATION_CLASS"] == (
        "shared.pagination.DefaultPagination"
    )


def test_default_page_size_is_defined_only_by_the_pagination_class() -> None:
    assert DefaultPagination.page_size == 20
    assert "PAGE_SIZE" not in settings.REST_FRAMEWORK
