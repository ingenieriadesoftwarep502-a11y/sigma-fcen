"""REST framework defaults that protect every future endpoint (T-00.5)."""

from typing import Any

from django.conf import settings
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from shared.pagination import DefaultPagination


def test_session_authentication_is_the_only_default_scheme() -> None:
    # ADR-007 (auth mechanism) is still open: no token/JWT scheme is configured yet.
    assert settings.REST_FRAMEWORK["DEFAULT_AUTHENTICATION_CLASSES"] == [
        "rest_framework.authentication.SessionAuthentication",
    ]


def test_anonymous_and_user_throttling_are_enabled() -> None:
    rest: dict[str, Any] = settings.REST_FRAMEWORK

    assert rest["DEFAULT_THROTTLE_CLASSES"] == [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ]
    assert set(rest["DEFAULT_THROTTLE_RATES"]) == {"anon", "user"}


def test_default_pagination_caps_page_size_at_100() -> None:
    request = APIRequestFactory().get("/items/", {"page_size": 500})
    paginator = DefaultPagination()
    page = paginator.paginate_queryset(list(range(1000)), Request(request))

    assert page is not None
    assert len(page) == 100
    assert settings.REST_FRAMEWORK["DEFAULT_PAGINATION_CLASS"] == (
        "shared.pagination.DefaultPagination"
    )
