"""JWT carried in HttpOnly cookies, never readable by page scripts (ADR-007)."""

from typing import Any

from django.conf import settings
from django.contrib.auth.base_user import AbstractBaseUser
from django.http import HttpRequest, HttpResponse
from drf_spectacular.extensions import OpenApiAuthenticationExtension
from rest_framework.authentication import CSRFCheck
from rest_framework.exceptions import PermissionDenied
from rest_framework.request import Request
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.tokens import Token

ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"
# The refresh token is only ever sent to the auth endpoints.
REFRESH_COOKIE_PATH = "/api/v1/auth/"


def enforce_csrf(request: Request) -> None:
    """Cookies are sent automatically by the browser, so unsafe requests need a CSRF token."""

    def get_response(_: HttpRequest) -> HttpResponse:
        return HttpResponse()

    check = CSRFCheck(get_response)
    check.process_request(request)
    reason = check.process_view(request, lambda _: HttpResponse(), (), {})
    if reason:
        raise PermissionDenied(f"CSRF Failed: {reason}")


class CookieJWTAuthentication(JWTAuthentication):
    # simplejwt annotates this return with an unbound TypeVar that no override can satisfy.
    def authenticate(self, request: Request) -> tuple[AbstractBaseUser, Token] | None:  # type: ignore[override]
        raw_token = request.COOKIES.get(ACCESS_COOKIE)
        if not raw_token:
            return None
        # Checks signature, expiry and that the user is still active (CA-HU11-2).
        validated_token = self.get_validated_token(raw_token.encode())
        user = self.get_user(validated_token)
        enforce_csrf(request)
        return user, validated_token


class CookieJWTAuthenticationScheme(OpenApiAuthenticationExtension):  # type: ignore[no-untyped-call]
    target_class = CookieJWTAuthentication
    name = "cookieJWT"

    def get_security_definition(self, auto_schema: Any) -> dict[str, str]:
        return {"type": "apiKey", "in": "cookie", "name": ACCESS_COOKIE}


def _cookie_options() -> dict[str, Any]:
    return {
        "httponly": True,
        "secure": settings.SESSION_COOKIE_SECURE,
        "samesite": settings.SESSION_COOKIE_SAMESITE,
    }


def set_token_cookies(response: HttpResponse, *, access: str, refresh: str | None = None) -> None:
    response.set_cookie(
        ACCESS_COOKIE,
        access,
        max_age=int(api_settings.ACCESS_TOKEN_LIFETIME.total_seconds()),
        path="/",
        **_cookie_options(),
    )
    if refresh is not None:
        response.set_cookie(
            REFRESH_COOKIE,
            refresh,
            max_age=int(api_settings.REFRESH_TOKEN_LIFETIME.total_seconds()),
            path=REFRESH_COOKIE_PATH,
            **_cookie_options(),
        )


def clear_token_cookies(response: HttpResponse) -> None:
    samesite = settings.SESSION_COOKIE_SAMESITE
    response.delete_cookie(ACCESS_COOKIE, path="/", samesite=samesite)
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_COOKIE_PATH, samesite=samesite)
