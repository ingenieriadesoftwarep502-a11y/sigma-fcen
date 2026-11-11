"""Session hardening on top of ADR-007: CSRF token delivery and token revocation.

The frontend and the API may live on different hosts, so the CSRF token travels in the
response body and the cookie stays HttpOnly. Signing in rotates the CSRF secret and revokes
the previous refresh token; changing the password revokes every token already issued.
"""

from typing import Any

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import register_student

CSRF_URL = "/api/v1/auth/csrf/"
LOGIN_URL = "/api/v1/auth/login/"
REFRESH_URL = "/api/v1/auth/refresh/"
LOGOUT_URL = "/api/v1/auth/logout/"
ME_URL = "/api/v1/users/me/"
EMAIL = "ana.perez@unal.edu.co"
PASSWORD = "Str0ng-Passw0rd!"


@pytest.fixture
def student(db: None) -> User:
    return register_student(email=EMAIL, password=PASSWORD, first_name="Ana", last_name="Pérez")


def _csrf_token(client: APIClient) -> str:
    token = client.get(CSRF_URL).json()["csrfToken"]
    assert isinstance(token, str)
    return token


def _login(client: APIClient, token: str) -> Any:
    return client.post(
        LOGIN_URL,
        {"email": EMAIL, "password": PASSWORD},
        format="json",
        HTTP_X_CSRFTOKEN=token,
    )


@pytest.mark.django_db
def test_csrf_endpoint_returns_the_token_in_the_body() -> None:
    client = APIClient(enforce_csrf_checks=True)

    response = client.get(CSRF_URL)

    assert response.status_code == 200
    assert response.json()["csrfToken"]


@pytest.mark.django_db
def test_csrf_cookie_is_httponly_because_scripts_get_the_token_from_the_body() -> None:
    response = APIClient().get(CSRF_URL)

    assert response.cookies["csrftoken"]["httponly"]


def test_token_from_the_body_authorizes_login(student: User) -> None:
    client = APIClient(enforce_csrf_checks=True)

    response = _login(client, _csrf_token(client))

    assert response.status_code == 200


def test_login_rotates_the_csrf_token(student: User) -> None:
    client = APIClient(enforce_csrf_checks=True)
    before_login = _csrf_token(client)
    _login(client, before_login)

    stale = client.post(LOGOUT_URL, HTTP_X_CSRFTOKEN=before_login)
    fresh = client.post(LOGOUT_URL, HTTP_X_CSRFTOKEN=_csrf_token(client))

    assert stale.status_code == 403
    assert fresh.status_code == 204


def test_login_revokes_the_previous_refresh_token(student: User) -> None:
    client = APIClient()
    client.post(LOGIN_URL, {"email": EMAIL, "password": PASSWORD}, format="json")
    old_refresh = client.cookies["refresh_token"].value

    client.post(LOGIN_URL, {"email": EMAIL, "password": PASSWORD}, format="json")
    replay = APIClient()
    replay.cookies["refresh_token"] = old_refresh

    assert replay.post(REFRESH_URL).status_code == 401


def test_changing_the_password_revokes_issued_tokens(api_client: APIClient, student: User) -> None:
    api_client.post(LOGIN_URL, {"email": EMAIL, "password": PASSWORD}, format="json")
    assert api_client.get(ME_URL).status_code == 200

    student.set_password("An0ther-Passw0rd!")
    student.save()

    assert api_client.get(ME_URL).status_code == 401
    assert api_client.post(REFRESH_URL).status_code == 401
