"""Login, token refresh, logout and own profile with JWT in HttpOnly cookies.

T-01.7 to T-01.9, CA-HU01-5, CA-HU11-2, RN-002.4, RNF-SEC-003, ADR-007.
"""

import logging
from datetime import timedelta
from typing import Any

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.models import User
from apps.accounts.services import register_student

LOGIN_URL = "/api/v1/auth/login/"
REFRESH_URL = "/api/v1/auth/refresh/"
LOGOUT_URL = "/api/v1/auth/logout/"
ME_URL = "/api/v1/users/me/"
EMAIL = "ana.perez@unal.edu.co"
PASSWORD = "Str0ng-Passw0rd!"
INVALID_CREDENTIALS = "Correo o contraseña incorrectos."


@pytest.fixture
def student(db: None) -> User:
    return register_student(email=EMAIL, password=PASSWORD, first_name="Ana", last_name="Pérez")


def _login(client: APIClient, email: str = EMAIL, password: str = PASSWORD) -> Any:
    return client.post(LOGIN_URL, {"email": email, "password": password}, format="json")


def test_t01_7_valid_credentials_set_httponly_token_cookies(
    api_client: APIClient, student: User
) -> None:
    response = _login(api_client)

    assert response.status_code == 200
    body = response.json()
    assert body["email"] == EMAIL
    assert body["roles"] == ["STUDENT"]
    # Tokens travel only in HttpOnly cookies, never in the body (ADR-007).
    assert "access" not in body
    assert "refresh" not in body
    access = response.cookies["access_token"]
    refresh = response.cookies["refresh_token"]
    assert access.value
    assert access["httponly"]
    assert access["samesite"] == "Lax"
    assert refresh.value
    assert refresh["httponly"]
    assert refresh["path"] == "/api/v1/auth/"
    # The frontend needs a CSRF cookie to send unsafe requests.
    assert response.cookies["csrftoken"].value


def test_t01_7_email_is_case_insensitive_at_login(api_client: APIClient, student: User) -> None:
    response = _login(api_client, email="Ana.Perez@UNAL.edu.co")

    assert response.status_code == 200


@pytest.mark.parametrize(
    ("email", "password"),
    [(EMAIL, "wrong-password"), ("nadie@unal.edu.co", PASSWORD)],
)
def test_t01_7_invalid_credentials_return_401(
    api_client: APIClient, student: User, email: str, password: str
) -> None:
    response = _login(api_client, email=email, password=password)

    assert response.status_code == 401
    assert response.json() == {"detail": INVALID_CREDENTIALS}
    assert "access_token" not in response.cookies


def test_rn_002_4_inactive_account_cannot_log_in(api_client: APIClient, student: User) -> None:
    student.is_active = False
    student.save()

    response = _login(api_client)

    assert response.status_code == 401
    assert response.json() == {"detail": INVALID_CREDENTIALS}


def test_ca_hu01_5_profile_shows_the_student_role(api_client: APIClient, student: User) -> None:
    _login(api_client)

    response = api_client.get(ME_URL)

    assert response.status_code == 200
    assert response.json() == {
        "id": str(student.pk),
        "email": EMAIL,
        "first_name": "Ana",
        "last_name": "Pérez",
        "roles": ["STUDENT"],
    }


@pytest.mark.django_db
def test_rnf_sec_003_profile_returns_401_without_credentials(api_client: APIClient) -> None:
    response = api_client.get(ME_URL)

    assert response.status_code == 401


@pytest.mark.django_db
def test_adr_007_logout_without_any_cookie_returns_204(api_client: APIClient) -> None:
    # Logging out is idempotent: there is nothing to revoke, but cookies are still cleared.
    response = api_client.post(LOGOUT_URL)

    assert response.status_code == 204
    assert response.cookies["access_token"].value == ""


def test_adr_007_logout_with_expired_access_cookie_revokes_refresh_and_clears_cookies(
    api_client: APIClient, student: User
) -> None:
    refresh = _login(api_client).cookies["refresh_token"].value
    expired = AccessToken.for_user(student)
    expired.set_exp(lifetime=-timedelta(minutes=1))
    api_client.cookies["access_token"] = str(expired)

    response = api_client.post(LOGOUT_URL)

    assert response.status_code == 204
    assert response.cookies["access_token"].value == ""
    assert response.cookies["refresh_token"].value == ""
    api_client.cookies["refresh_token"] = refresh
    assert api_client.post(REFRESH_URL).status_code == 401


def test_ca_hu11_2_deactivation_invalidates_an_already_issued_access_token(
    api_client: APIClient, student: User
) -> None:
    _login(api_client)
    User.objects.filter(pk=student.pk).update(is_active=False)

    response = api_client.get(ME_URL)

    assert response.status_code == 401


def test_t01_7_refresh_issues_a_new_access_cookie(api_client: APIClient, student: User) -> None:
    first_access = _login(api_client).cookies["access_token"].value

    response = api_client.post(REFRESH_URL)

    assert response.status_code == 200
    new_access = response.cookies["access_token"]
    assert new_access.value
    assert new_access.value != first_access
    assert new_access["httponly"]


@pytest.mark.django_db
def test_t01_7_refresh_without_cookie_returns_401(api_client: APIClient) -> None:
    response = api_client.post(REFRESH_URL)

    assert response.status_code == 401


def test_t01_7_refresh_with_tampered_cookie_returns_401(
    api_client: APIClient, student: User
) -> None:
    _login(api_client)
    api_client.cookies["refresh_token"] = "not-a-jwt"

    response = api_client.post(REFRESH_URL)

    assert response.status_code == 401


def test_ca_hu11_2_deactivated_user_cannot_refresh(api_client: APIClient, student: User) -> None:
    _login(api_client)
    User.objects.filter(pk=student.pk).update(is_active=False)

    response = api_client.post(REFRESH_URL)

    assert response.status_code == 401


def test_t01_7_logout_clears_the_token_cookies(api_client: APIClient, student: User) -> None:
    _login(api_client)

    response = api_client.post(LOGOUT_URL)

    assert response.status_code == 204
    assert response.cookies["access_token"].value == ""
    assert response.cookies["refresh_token"].value == ""
    assert response.cookies["refresh_token"]["path"] == "/api/v1/auth/"
    assert api_client.get(ME_URL).status_code == 401


def test_adr_007_cookie_authenticated_unsafe_request_requires_csrf_token(student: User) -> None:
    client = APIClient(enforce_csrf_checks=True)
    login = _login(client)

    without_token = client.post(LOGOUT_URL)
    with_token = client.post(LOGOUT_URL, HTTP_X_CSRFTOKEN=login.cookies["csrftoken"].value)

    assert without_token.status_code == 403
    assert with_token.status_code == 204


def test_adr_007_refresh_requires_csrf_token(student: User) -> None:
    client = APIClient(enforce_csrf_checks=True)
    login = _login(client)

    without_token = client.post(REFRESH_URL)
    with_token = client.post(REFRESH_URL, HTTP_X_CSRFTOKEN=login.cookies["csrftoken"].value)

    assert without_token.status_code == 403
    assert with_token.status_code == 200


def test_adr_007_token_cookies_use_the_configured_lifetimes(
    api_client: APIClient, student: User
) -> None:
    response = _login(api_client)

    # 15-minute access token and 1-day refresh token, not simplejwt's 5-minute default.
    assert response.cookies["access_token"]["max-age"] == 15 * 60
    assert response.cookies["refresh_token"]["max-age"] == 24 * 60 * 60


def test_adr_007_refresh_rotates_the_refresh_cookie(api_client: APIClient, student: User) -> None:
    first_refresh = _login(api_client).cookies["refresh_token"].value

    response = api_client.post(REFRESH_URL)

    assert response.status_code == 200
    new_refresh = response.cookies["refresh_token"]
    assert new_refresh.value
    assert new_refresh.value != first_refresh
    assert new_refresh["httponly"]
    assert new_refresh["path"] == "/api/v1/auth/"


def test_adr_007_rotated_refresh_token_cannot_be_reused(
    api_client: APIClient, student: User
) -> None:
    first_refresh = _login(api_client).cookies["refresh_token"].value
    api_client.post(REFRESH_URL)
    api_client.cookies["refresh_token"] = first_refresh

    response = api_client.post(REFRESH_URL)

    assert response.status_code == 401


def test_adr_007_logout_revokes_the_refresh_token(api_client: APIClient, student: User) -> None:
    refresh = _login(api_client).cookies["refresh_token"].value
    api_client.post(LOGOUT_URL)
    api_client.cookies["refresh_token"] = refresh

    response = api_client.post(REFRESH_URL)

    assert response.status_code == 401


def test_adr_007_logout_with_invalid_refresh_cookie_still_clears_cookies(
    api_client: APIClient, student: User
) -> None:
    _login(api_client)
    api_client.cookies["refresh_token"] = "not-a-jwt"

    response = api_client.post(LOGOUT_URL)

    assert response.status_code == 204
    assert response.cookies["access_token"].value == ""
    assert response.cookies["refresh_token"].value == ""


def test_adr_007_logout_without_refresh_cookie_still_clears_cookies(
    api_client: APIClient, student: User
) -> None:
    _login(api_client)
    del api_client.cookies["refresh_token"]

    response = api_client.post(LOGOUT_URL)

    assert response.status_code == 204
    assert response.cookies["access_token"].value == ""


def test_t01_7_invalid_refresh_clears_the_token_cookies(
    api_client: APIClient, student: User
) -> None:
    _login(api_client)
    api_client.cookies["refresh_token"] = "not-a-jwt"

    response = api_client.post(REFRESH_URL)

    assert response.status_code == 401
    assert response.cookies["access_token"].value == ""
    assert response.cookies["refresh_token"].value == ""
    assert response.cookies["refresh_token"]["path"] == "/api/v1/auth/"


def test_ca_hu11_2_refresh_of_deactivated_user_clears_the_token_cookies(
    api_client: APIClient, student: User
) -> None:
    _login(api_client)
    User.objects.filter(pk=student.pk).update(is_active=False)

    response = api_client.post(REFRESH_URL)

    assert response.status_code == 401
    assert response.cookies["access_token"].value == ""
    assert response.cookies["refresh_token"].value == ""


def test_rnf_obs_001_failed_login_is_logged_without_secrets(
    api_client: APIClient, student: User, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.INFO, logger="apps.accounts"):
        _login(api_client, password="wrong-password")

    records = [r for r in caplog.records if r.name.startswith("apps.accounts")]
    assert [r.levelno for r in records] == [logging.WARNING]
    assert "wrong-password" not in caplog.text
    assert PASSWORD not in caplog.text


def test_rnf_obs_001_invalid_refresh_is_logged_without_the_token(
    api_client: APIClient, student: User, caplog: pytest.LogCaptureFixture
) -> None:
    _login(api_client)
    api_client.cookies["refresh_token"] = "not-a-jwt"

    with caplog.at_level(logging.INFO, logger="apps.accounts"):
        api_client.post(REFRESH_URL)

    records = [r for r in caplog.records if r.name.startswith("apps.accounts")]
    assert len(records) == 1
    assert "not-a-jwt" not in caplog.text


def test_rnf_obs_001_successful_login_does_not_log_tokens(
    api_client: APIClient, student: User, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.DEBUG):
        response = _login(api_client)

    assert response.cookies["access_token"].value not in caplog.text
    assert response.cookies["refresh_token"].value not in caplog.text
    assert PASSWORD not in caplog.text
