"""Reusable role permissions checked on the server (T-01.10, RN-002.1, RNF-SEC-004, ADR-008)."""

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Role, User, UserRole
from shared.permissions import HasRole, IsAdmin, IsMonitor, IsStudent, IsTeacher

pytestmark = [pytest.mark.django_db, pytest.mark.urls("tests.api.role_urls")]

URL_BY_ROLE = {
    Role.Code.STUDENT: "/test-only/student/",
    Role.Code.MONITOR: "/test-only/monitor/",
    Role.Code.TEACHER: "/test-only/teacher/",
    Role.Code.ADMIN: "/test-only/admin/",
}


def _client_for(*codes: str) -> APIClient:
    user = User.objects.create_user(email="persona@unal.edu.co", password="Str0ng-Passw0rd!")
    for code in codes:
        UserRole.objects.create(user=user, role=Role.objects.get(code=code))
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.parametrize("url", URL_BY_ROLE.values())
def test_rnf_sec_003_anonymous_gets_401_on_every_role_endpoint(url: str) -> None:
    assert APIClient().get(url).status_code == 401


@pytest.mark.parametrize("role", list(URL_BY_ROLE))
@pytest.mark.parametrize("endpoint_role", list(URL_BY_ROLE))
def test_rnf_sec_004_each_role_reaches_only_its_own_endpoints(
    role: Role.Code, endpoint_role: Role.Code
) -> None:
    response = _client_for(role).get(URL_BY_ROLE[endpoint_role])

    assert response.status_code == (200 if role == endpoint_role else 403)


def test_adr_008_student_who_is_also_monitor_reaches_both_endpoints() -> None:
    client = _client_for(Role.Code.STUDENT, Role.Code.MONITOR)

    assert client.get(URL_BY_ROLE[Role.Code.STUDENT]).status_code == 200
    assert client.get(URL_BY_ROLE[Role.Code.MONITOR]).status_code == 200
    assert client.get(URL_BY_ROLE[Role.Code.ADMIN]).status_code == 403


@pytest.mark.parametrize("url", URL_BY_ROLE.values())
def test_rn_002_1_user_without_roles_is_rejected_everywhere(url: str) -> None:
    assert _client_for().get(url).status_code == 403


def test_rn_002_1_django_superuser_flag_does_not_grant_business_roles() -> None:
    # Flags set directly, bypassing create_superuser, which also grants the ADMIN role.
    superuser = User.objects.create_user(
        email="root@unal.edu.co", password="Str0ng-Passw0rd!", is_staff=True, is_superuser=True
    )
    client = APIClient()
    client.force_authenticate(user=superuser)

    assert client.get(URL_BY_ROLE[Role.Code.ADMIN]).status_code == 403


@pytest.mark.parametrize(
    ("permission", "code"),
    [
        (IsStudent, Role.Code.STUDENT),
        (IsMonitor, Role.Code.MONITOR),
        (IsTeacher, Role.Code.TEACHER),
        (IsAdmin, Role.Code.ADMIN),
    ],
)
def test_rn_002_1_permissions_use_the_role_catalog_codes(
    permission: type[HasRole], code: Role.Code
) -> None:
    # Bound to the catalog enum, not a free string that could drift from it.
    assert isinstance(permission.role, Role.Code)
    assert permission.role is code
