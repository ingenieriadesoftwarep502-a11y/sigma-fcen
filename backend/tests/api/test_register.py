"""Public self-registration endpoint (HU-01, T-01.4 to T-01.6, ADR-009)."""

from typing import Any
from unittest import mock

import pytest
from django.db import IntegrityError
from rest_framework.test import APIClient

from apps.accounts.models import Role, User

REGISTER_URL = "/api/v1/auth/register/"
PASSWORD = "Str0ng-Passw0rd!"


def _payload(**overrides: Any) -> dict[str, Any]:
    return {
        "email": "ana.perez@unal.edu.co",
        "password": PASSWORD,
        "first_name": "Ana",
        "last_name": "Pérez",
        **overrides,
    }


@pytest.mark.django_db
def test_ca_hu01_1_institutional_email_creates_active_account(api_client: APIClient) -> None:
    response = api_client.post(REGISTER_URL, _payload(), format="json")

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "ana.perez@unal.edu.co"
    assert body["first_name"] == "Ana"
    assert body["last_name"] == "Pérez"
    assert body["roles"] == ["STUDENT"]
    assert "password" not in body
    user = User.objects.get(email="ana.perez@unal.edu.co")
    assert str(user.pk) == body["id"]
    # No email verification in v1 (ADR-009): the account is usable right away.
    assert user.is_active
    assert user.check_password(PASSWORD)


@pytest.mark.django_db
@pytest.mark.parametrize("email", ["ana.perez@unal.edu.co", "ANA.PEREZ@unal.edu.co"])
def test_ca_hu01_2_registered_email_returns_400_without_second_account(
    api_client: APIClient, email: str
) -> None:
    api_client.post(REGISTER_URL, _payload(), format="json")

    response = api_client.post(REGISTER_URL, _payload(email=email), format="json")

    assert response.status_code == 400
    assert response.json()["email"] == ["Ya existe una cuenta con este correo."]
    assert User.objects.filter(email__iexact="ana.perez@unal.edu.co").count() == 1


@pytest.mark.django_db
def test_ca_hu01_2_concurrent_duplicate_hits_the_constraint_and_returns_400(
    api_client: APIClient,
) -> None:
    # Both requests pass validation; the second insert is stopped by the unique constraint.
    with mock.patch(
        "apps.accounts.views.register_student", side_effect=IntegrityError("duplicate key")
    ):
        response = api_client.post(REGISTER_URL, _payload(), format="json")

    assert response.status_code == 400
    assert response.json()["email"] == ["Ya existe una cuenta con este correo."]


@pytest.mark.django_db
def test_ca_hu01_3_non_institutional_email_is_rejected(api_client: APIClient) -> None:
    response = api_client.post(REGISTER_URL, _payload(email="ana@gmail.com"), format="json")

    assert response.status_code == 400
    assert response.json()["email"] == ["Usa tu correo institucional @unal.edu.co."]
    assert not User.objects.exists()


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("password", "rule"),
    [
        ("Ab1!", "too short"),
        ("12345678901", "entirely numeric"),
        ("password123", "too common"),
        ("ana.perez.unal", "too similar"),
    ],
)
def test_ca_hu01_4_weak_password_returns_400_with_broken_rule(
    api_client: APIClient, password: str, rule: str
) -> None:
    response = api_client.post(REGISTER_URL, _payload(password=password), format="json")

    assert response.status_code == 400
    assert any(rule in message for message in response.json()["password"])
    assert not User.objects.exists()


@pytest.mark.django_db
def test_rn_001_4_self_registration_ignores_requested_roles(api_client: APIClient) -> None:
    response = api_client.post(
        REGISTER_URL, _payload(roles=["ADMIN"], is_staff=True), format="json"
    )

    assert response.status_code == 201
    user = User.objects.get(email="ana.perez@unal.edu.co")
    assert list(user.roles.values_list("code", flat=True)) == [Role.Code.STUDENT]
    assert not user.is_staff
    assert not user.is_superuser


@pytest.mark.django_db
@pytest.mark.parametrize("missing", ["email", "password", "first_name", "last_name"])
def test_t01_4_required_fields(api_client: APIClient, missing: str) -> None:
    payload = _payload()
    del payload[missing]

    response = api_client.post(REGISTER_URL, payload, format="json")

    assert response.status_code == 400
    assert missing in response.json()
