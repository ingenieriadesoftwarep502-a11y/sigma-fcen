"""Deactivation that reports its impact before confirming (T-01.12, CA-HU11-2, CA-HU11-3).

Reservations arrive in FASE-04; until then the impact count comes from a placeholder that
returns 0 (registered as technical debt).
"""

import re
from unittest import mock

import pytest
from rest_framework.test import APIClient

from apps.accounts.domain.rules import AdminLockoutError
from apps.accounts.models import AuditLog, Role, User, UserRole
from apps.accounts.services import deactivate_user, register_student

pytestmark = pytest.mark.django_db

PASSWORD = "Str0ng-Passw0rd!"


@pytest.fixture
def admin() -> User:
    user = User.objects.create_user(email="admin@unal.edu.co", password=PASSWORD)
    UserRole.objects.create(user=user, role=Role.objects.get(code=Role.Code.ADMIN))
    return user


@pytest.fixture
def admin_client(admin: User) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=admin)
    return client


@pytest.fixture
def student() -> User:
    return register_student(
        email="ana.perez@unal.edu.co", password=PASSWORD, first_name="Ana", last_name="Pérez"
    )


def _url(user: User) -> str:
    return f"/api/v1/users/{user.pk}/deactivate/"


def test_rnf_sec_003_deactivate_requires_authentication(student: User) -> None:
    assert APIClient().post(_url(student), {"confirm": True}, format="json").status_code == 401


@pytest.mark.parametrize("code", [Role.Code.STUDENT, Role.Code.MONITOR, Role.Code.TEACHER])
def test_ca_hu11_4_only_admins_can_deactivate(student: User, code: str) -> None:
    other = User.objects.create_user(email=f"{code.lower()}@unal.edu.co", password=PASSWORD)
    UserRole.objects.create(user=other, role=Role.objects.get(code=code))
    client = APIClient()
    client.force_authenticate(user=other)

    response = client.post(_url(student), {"confirm": True}, format="json")

    assert response.status_code == 403
    student.refresh_from_db()
    assert student.is_active


def test_ca_hu11_3_without_confirmation_only_reports_the_impact(
    admin_client: APIClient, student: User
) -> None:
    response = admin_client.post(_url(student), {}, format="json")

    assert response.status_code == 200
    body = response.json()
    assert body["deactivated"] is False
    assert body["impact"] == {"future_reservations": 0}
    assert body["user"]["is_active"] is True
    student.refresh_from_db()
    assert student.is_active
    assert not AuditLog.objects.exists()


def test_ca_hu11_3_impact_counts_future_reservations(
    admin_client: APIClient, student: User
) -> None:
    with mock.patch("apps.accounts.services.count_future_reservations", return_value=3):
        response = admin_client.post(_url(student), {"confirm": False}, format="json")

    assert response.json()["impact"] == {"future_reservations": 3}


def test_ca_hu11_2_confirmed_deactivation_invalidates_credentials_immediately(
    admin_client: APIClient, admin: User, student: User
) -> None:
    session = APIClient()
    login = session.post(
        "/api/v1/auth/login/", {"email": student.email, "password": PASSWORD}, format="json"
    )
    assert login.status_code == 200

    response = admin_client.post(_url(student), {"confirm": True}, format="json")

    assert response.status_code == 200
    body = response.json()
    assert body["deactivated"] is True
    assert body["user"]["is_active"] is False
    assert session.get("/api/v1/users/me/").status_code == 401
    relogin = APIClient().post(
        "/api/v1/auth/login/", {"email": student.email, "password": PASSWORD}, format="json"
    )
    assert relogin.status_code == 401


def test_ca_hu11_5_confirmed_deactivation_is_audited_with_its_impact(
    admin_client: APIClient, admin: User, student: User
) -> None:
    admin_client.post(_url(student), {"confirm": True}, format="json")

    entry = AuditLog.objects.get()
    assert (entry.actor, entry.target, entry.action) == (
        admin,
        student,
        AuditLog.Action.USER_DEACTIVATED,
    )
    assert entry.changes == {"is_active": [True, False], "future_reservations": 0}


def test_t01_12_deactivating_an_inactive_account_changes_nothing(
    admin_client: APIClient, student: User
) -> None:
    User.objects.filter(pk=student.pk).update(is_active=False)

    response = admin_client.post(_url(student), {"confirm": True}, format="json")

    assert response.status_code == 200
    assert response.json()["deactivated"] is True
    assert not AuditLog.objects.exists()


def test_t01_12_confirm_must_be_a_boolean(admin_client: APIClient, student: User) -> None:
    response = admin_client.post(_url(student), {"confirm": "tal vez"}, format="json")

    assert response.status_code == 400
    assert "confirm" in response.json()


# --- The system never runs out of administrators -------------------------------------------

LAST_ADMIN_MESSAGE = "El sistema debe conservar al menos un administrador activo."
SELF_DEACTIVATION_MESSAGE = "No puedes desactivar tu propia cuenta."


def _admin(email: str) -> User:
    user = User.objects.create_user(email=email, password=PASSWORD)
    UserRole.objects.create(user=user, role=Role.objects.get(code=Role.Code.ADMIN))
    return user


def test_admin_cannot_deactivate_their_own_account(admin_client: APIClient, admin: User) -> None:
    _admin("otra.admin@unal.edu.co")

    response = admin_client.post(_url(admin), {"confirm": True}, format="json")

    assert response.status_code == 400
    assert response.json() == {"detail": SELF_DEACTIVATION_MESSAGE}
    admin.refresh_from_db()
    assert admin.is_active
    assert not AuditLog.objects.exists()


def test_sole_admin_cannot_deactivate_their_own_account(
    admin_client: APIClient, admin: User
) -> None:
    response = admin_client.post(_url(admin), {"confirm": True}, format="json")

    assert response.status_code == 400
    admin.refresh_from_db()
    assert admin.is_active
    assert not AuditLog.objects.exists()


def test_last_active_admin_cannot_be_deactivated(admin: User, student: User) -> None:
    User.objects.filter(pk=_admin("inactiva@unal.edu.co").pk).update(is_active=False)

    with pytest.raises(AdminLockoutError, match=re.escape(LAST_ADMIN_MESSAGE)):
        deactivate_user(actor=student, user=admin)

    admin.refresh_from_db()
    assert admin.is_active
    assert not AuditLog.objects.exists()


def test_admin_deactivates_another_admin_while_one_remains_active(
    admin_client: APIClient, admin: User
) -> None:
    other = _admin("otra.admin@unal.edu.co")

    response = admin_client.post(_url(other), {"confirm": True}, format="json")

    assert response.status_code == 200
    assert response.json()["deactivated"] is True
    other.refresh_from_db()
    assert not other.is_active
    assert AuditLog.objects.get().action == AuditLog.Action.USER_DEACTIVATED
