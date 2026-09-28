"""Administrative user management with audit trail (HU-11, T-01.11, T-01.13).

CA-HU11-1, CA-HU11-4, CA-HU11-5, RF-020, RF-021, RNF-SEC-003, RNF-SEC-004.
"""

import re
from typing import Any
from unittest import mock

import pytest
from django.db import IntegrityError
from rest_framework.test import APIClient

from apps.accounts.domain.rules import AdminLockoutError
from apps.accounts.models import AuditLog, Role, User, UserRole
from apps.accounts.services import register_student, set_roles, update_user

pytestmark = pytest.mark.django_db

USERS_URL = "/api/v1/users/"
PASSWORD = "Str0ng-Passw0rd!"


def _user(email: str, *codes: str) -> User:
    user = User.objects.create_user(email=email, password=PASSWORD, first_name="N", last_name="N")
    for code in codes:
        UserRole.objects.create(user=user, role=Role.objects.get(code=code))
    return user


def _client_for(user: User) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def admin() -> User:
    return _user("admin@unal.edu.co", Role.Code.ADMIN)


@pytest.fixture
def admin_client(admin: User) -> APIClient:
    return _client_for(admin)


@pytest.fixture
def student() -> User:
    return register_student(
        email="ana.perez@unal.edu.co", password=PASSWORD, first_name="Ana", last_name="Pérez"
    )


def _new_user_payload(**overrides: Any) -> dict[str, Any]:
    return {
        "email": "docente@unal.edu.co",
        "password": PASSWORD,
        "first_name": "Laura",
        "last_name": "Gómez",
        "roles": ["TEACHER"],
        **overrides,
    }


def _endpoints(student: User) -> list[tuple[str, str]]:
    detail = f"{USERS_URL}{student.pk}/"
    return [
        ("get", USERS_URL),
        ("post", USERS_URL),
        ("get", detail),
        ("patch", detail),
        ("post", f"{detail}roles/"),
    ]


# --- Authorization: every endpoint, every non-admin role -------------------------------------


def test_rnf_sec_003_every_management_endpoint_returns_401_without_credentials(
    student: User,
) -> None:
    for method, url in _endpoints(student):
        assert getattr(APIClient(), method)(url).status_code == 401, (method, url)


@pytest.mark.parametrize("code", [Role.Code.STUDENT, Role.Code.MONITOR, Role.Code.TEACHER])
def test_ca_hu11_4_non_admin_roles_get_403_on_every_management_endpoint(
    student: User, code: str
) -> None:
    client = _client_for(_user(f"{code.lower()}@unal.edu.co", code))

    for method, url in _endpoints(student):
        response = getattr(client, method)(url, {}, format="json")
        assert response.status_code == 403, (method, url)


# --- Create --------------------------------------------------------------------------------


def test_ca_hu11_1_admin_creates_active_user_with_role_that_can_log_in(
    admin_client: APIClient,
) -> None:
    response = admin_client.post(USERS_URL, _new_user_payload(), format="json")

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "docente@unal.edu.co"
    assert body["roles"] == ["TEACHER"]
    assert body["is_active"] is True
    assert "password" not in body

    login = APIClient().post(
        "/api/v1/auth/login/",
        {"email": "docente@unal.edu.co", "password": PASSWORD},
        format="json",
    )
    assert login.status_code == 200
    assert login.json()["roles"] == ["TEACHER"]


def test_rf_021_admin_creates_user_with_several_roles(admin_client: APIClient) -> None:
    response = admin_client.post(
        USERS_URL, _new_user_payload(roles=["STUDENT", "MONITOR"]), format="json"
    )

    assert response.status_code == 201
    assert sorted(response.json()["roles"]) == ["MONITOR", "STUDENT"]


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"email": "docente@gmail.com"}, "email"),
        ({"password": "12345678"}, "password"),
        ({"roles": ["DEAN"]}, "roles"),
        ({"roles": []}, "roles"),
    ],
)
def test_t01_11_create_rejects_invalid_data(
    admin_client: APIClient, overrides: dict[str, Any], field: str
) -> None:
    response = admin_client.post(USERS_URL, _new_user_payload(**overrides), format="json")

    assert response.status_code == 400
    assert field in response.json()
    assert not User.objects.filter(email__iexact="docente@unal.edu.co").exists()


def test_rn_001_1_create_rejects_existing_email_in_any_case(
    admin_client: APIClient, student: User
) -> None:
    response = admin_client.post(
        USERS_URL, _new_user_payload(email="ANA.PEREZ@unal.edu.co"), format="json"
    )

    assert response.status_code == 400
    assert response.json()["email"] == ["Ya existe una cuenta con este correo."]


# --- List and retrieve ---------------------------------------------------------------------


def test_rf_020_admin_lists_users_paginated(admin_client: APIClient, student: User) -> None:
    response = admin_client.get(USERS_URL)

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 2
    emails = [row["email"] for row in body["results"]]
    assert emails == ["admin@unal.edu.co", "ana.perez@unal.edu.co"]
    row = body["results"][1]
    assert row["roles"] == ["STUDENT"]
    assert row["is_active"] is True
    assert "password" not in row


def test_rf_020_admin_retrieves_one_user(admin_client: APIClient, student: User) -> None:
    response = admin_client.get(f"{USERS_URL}{student.pk}/")

    assert response.status_code == 200
    assert response.json()["email"] == "ana.perez@unal.edu.co"


def test_rf_020_unknown_user_returns_404(admin_client: APIClient) -> None:
    response = admin_client.get(f"{USERS_URL}00000000-0000-0000-0000-000000000000/")

    assert response.status_code == 404


# --- Edit ----------------------------------------------------------------------------------


def test_rf_020_admin_edits_names(admin_client: APIClient, student: User) -> None:
    response = admin_client.patch(
        f"{USERS_URL}{student.pk}/", {"first_name": "Ana María"}, format="json"
    )

    assert response.status_code == 200
    assert response.json()["first_name"] == "Ana María"
    student.refresh_from_db()
    assert student.first_name == "Ana María"
    assert student.last_name == "Pérez"


def test_rf_020_admin_reactivates_a_deactivated_account(
    admin_client: APIClient, student: User
) -> None:
    User.objects.filter(pk=student.pk).update(is_active=False)

    response = admin_client.patch(f"{USERS_URL}{student.pk}/", {"is_active": True}, format="json")

    assert response.status_code == 200
    assert response.json()["is_active"] is True
    login = APIClient().post(
        "/api/v1/auth/login/", {"email": student.email, "password": PASSWORD}, format="json"
    )
    assert login.status_code == 200


def test_t01_11_patch_cannot_deactivate_so_the_impact_check_is_not_skipped(
    admin_client: APIClient, student: User
) -> None:
    response = admin_client.patch(f"{USERS_URL}{student.pk}/", {"is_active": False}, format="json")

    assert response.status_code == 400
    assert "is_active" in response.json()
    student.refresh_from_db()
    assert student.is_active


def test_t01_11_patch_validates_email_domain(admin_client: APIClient, student: User) -> None:
    response = admin_client.patch(
        f"{USERS_URL}{student.pk}/", {"email": "ana@gmail.com"}, format="json"
    )

    assert response.status_code == 400
    assert "email" in response.json()


def test_t01_11_full_replacement_with_put_is_not_allowed(
    admin_client: APIClient, student: User
) -> None:
    response = admin_client.put(f"{USERS_URL}{student.pk}/", {}, format="json")

    assert response.status_code == 405


# --- Roles ---------------------------------------------------------------------------------


def test_rf_021_admin_assigns_and_removes_roles(admin_client: APIClient, student: User) -> None:
    url = f"{USERS_URL}{student.pk}/roles/"

    added = admin_client.post(url, {"roles": ["STUDENT", "MONITOR"]}, format="json")
    removed = admin_client.post(url, {"roles": ["MONITOR"]}, format="json")

    assert added.status_code == 200
    assert sorted(added.json()["roles"]) == ["MONITOR", "STUDENT"]
    assert removed.status_code == 200
    assert removed.json()["roles"] == ["MONITOR"]
    assert list(student.roles.values_list("code", flat=True)) == ["MONITOR"]


@pytest.mark.parametrize("roles", [["DEAN"], []])
def test_rf_021_invalid_role_list_returns_400(
    admin_client: APIClient, student: User, roles: list[str]
) -> None:
    response = admin_client.post(f"{USERS_URL}{student.pk}/roles/", {"roles": roles}, format="json")

    assert response.status_code == 400
    assert list(student.roles.values_list("code", flat=True)) == ["STUDENT"]


# --- Audit (CA-HU11-5) ---------------------------------------------------------------------


def test_ca_hu11_5_create_is_audited_without_the_password(
    admin_client: APIClient, admin: User
) -> None:
    admin_client.post(USERS_URL, _new_user_payload(), format="json")

    entry = AuditLog.objects.get()
    assert entry.actor == admin
    assert entry.target.email == "docente@unal.edu.co"
    assert entry.action == AuditLog.Action.USER_CREATED
    assert entry.created_at is not None
    assert PASSWORD not in str(entry.changes)
    assert "password" not in entry.changes


def test_ca_hu11_5_edit_is_audited_with_before_and_after(
    admin_client: APIClient, admin: User, student: User
) -> None:
    admin_client.patch(f"{USERS_URL}{student.pk}/", {"first_name": "Ana María"}, format="json")

    entry = AuditLog.objects.get()
    assert (entry.actor, entry.target, entry.action) == (
        admin,
        student,
        AuditLog.Action.USER_UPDATED,
    )
    assert entry.changes == {"first_name": ["Ana", "Ana María"]}


def test_ca_hu11_5_reactivation_is_audited_as_activation(
    admin_client: APIClient, student: User
) -> None:
    User.objects.filter(pk=student.pk).update(is_active=False)

    admin_client.patch(f"{USERS_URL}{student.pk}/", {"is_active": True}, format="json")

    assert AuditLog.objects.get().action == AuditLog.Action.USER_ACTIVATED


def test_ca_hu11_5_role_change_is_audited(
    admin_client: APIClient, admin: User, student: User
) -> None:
    admin_client.post(
        f"{USERS_URL}{student.pk}/roles/", {"roles": ["STUDENT", "MONITOR"]}, format="json"
    )

    entry = AuditLog.objects.get()
    assert (entry.actor, entry.target, entry.action) == (
        admin,
        student,
        AuditLog.Action.ROLES_CHANGED,
    )
    assert entry.changes == {"roles": [["STUDENT"], ["MONITOR", "STUDENT"]]}


def test_ca_hu11_5_rejected_operations_leave_no_audit_entry(
    admin_client: APIClient, student: User
) -> None:
    admin_client.post(USERS_URL, _new_user_payload(email="x@gmail.com"), format="json")
    admin_client.post(f"{USERS_URL}{student.pk}/roles/", {"roles": []}, format="json")

    assert not AuditLog.objects.exists()


# --- Email changes and concurrent duplicates -----------------------------------------------


def test_rn_001_1_patch_rejects_the_email_of_another_account(
    admin_client: APIClient, admin: User, student: User
) -> None:
    response = admin_client.patch(
        f"{USERS_URL}{student.pk}/", {"email": "ADMIN@unal.edu.co"}, format="json"
    )

    assert response.status_code == 400
    assert response.json()["email"] == ["Ya existe una cuenta con este correo."]


def test_rf_020_patch_accepts_the_same_email_with_other_case(
    admin_client: APIClient, student: User
) -> None:
    response = admin_client.patch(
        f"{USERS_URL}{student.pk}/", {"email": "Ana.Perez@unal.edu.co"}, format="json"
    )

    assert response.status_code == 200
    # Emails are stored in lowercase (RN-001.1), so this is not a change.
    assert response.json()["email"] == "ana.perez@unal.edu.co"


@pytest.mark.parametrize(
    ("service", "method", "detail"),
    [("create_user", "post", False), ("update_user", "patch", True)],
)
def test_rn_001_1_concurrent_duplicate_email_returns_400(
    admin_client: APIClient, student: User, service: str, method: str, detail: bool
) -> None:
    url = f"{USERS_URL}{student.pk}/" if detail else USERS_URL
    with mock.patch(f"apps.accounts.views.{service}", side_effect=IntegrityError("duplicate")):
        response = getattr(admin_client, method)(url, _new_user_payload(), format="json")

    assert response.status_code == 400
    assert response.json()["email"] == ["Ya existe una cuenta con este correo."]


# --- The system never runs out of administrators -------------------------------------------

LAST_ADMIN_MESSAGE = "El sistema debe conservar al menos un administrador activo."
SELF_REVOKE_MESSAGE = "No puedes quitarte el rol de administrador."


def test_admin_cannot_remove_their_own_admin_role(admin_client: APIClient, admin: User) -> None:
    _user("otra.admin@unal.edu.co", Role.Code.ADMIN)

    response = admin_client.post(
        f"{USERS_URL}{admin.pk}/roles/", {"roles": ["TEACHER"]}, format="json"
    )

    assert response.status_code == 400
    assert response.json() == {"detail": SELF_REVOKE_MESSAGE}
    assert admin.has_role(Role.Code.ADMIN)
    assert not AuditLog.objects.exists()


def test_sole_admin_cannot_remove_the_admin_role_through_the_roles_endpoint(
    admin_client: APIClient, admin: User
) -> None:
    response = admin_client.post(
        f"{USERS_URL}{admin.pk}/roles/", {"roles": ["STUDENT"]}, format="json"
    )

    assert response.status_code == 400
    assert list(admin.roles.values_list("code", flat=True)) == ["ADMIN"]
    assert not AuditLog.objects.exists()


def test_admin_keeps_admin_role_while_changing_their_other_roles(
    admin_client: APIClient, admin: User
) -> None:
    response = admin_client.post(
        f"{USERS_URL}{admin.pk}/roles/", {"roles": ["ADMIN", "TEACHER"]}, format="json"
    )

    assert response.status_code == 200
    assert sorted(response.json()["roles"]) == ["ADMIN", "TEACHER"]


def test_last_active_admin_cannot_lose_the_admin_role(admin: User, student: User) -> None:
    # An inactive administrator cannot sign in, so it does not keep the system manageable.
    User.objects.filter(pk=_user("inactiva@unal.edu.co", Role.Code.ADMIN).pk).update(
        is_active=False
    )

    with pytest.raises(AdminLockoutError, match=re.escape(LAST_ADMIN_MESSAGE)):
        set_roles(actor=student, user=admin, roles=[Role.Code.TEACHER])

    assert admin.has_role(Role.Code.ADMIN)
    assert not AuditLog.objects.exists()


def test_admin_removes_the_admin_role_of_another_admin(
    admin_client: APIClient, admin: User
) -> None:
    other = _user("otra.admin@unal.edu.co", Role.Code.ADMIN)

    response = admin_client.post(
        f"{USERS_URL}{other.pk}/roles/", {"roles": ["TEACHER"]}, format="json"
    )

    assert response.status_code == 200
    assert response.json()["roles"] == ["TEACHER"]
    assert AuditLog.objects.get().action == AuditLog.Action.ROLES_CHANGED


def test_patch_cannot_deactivate_the_last_admin(admin_client: APIClient, admin: User) -> None:
    response = admin_client.patch(f"{USERS_URL}{admin.pk}/", {"is_active": False}, format="json")

    assert response.status_code == 400
    admin.refresh_from_db()
    assert admin.is_active
    assert not AuditLog.objects.exists()


def test_update_user_service_cannot_deactivate_the_last_admin(admin: User, student: User) -> None:
    with pytest.raises(AdminLockoutError, match=re.escape(LAST_ADMIN_MESSAGE)):
        update_user(actor=student, user=admin, data={"is_active": False})

    admin.refresh_from_db()
    assert admin.is_active
    assert not AuditLog.objects.exists()
