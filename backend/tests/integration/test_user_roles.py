"""Business roles held by users through UserRole (T-01.2, RN-002, ADR-008)."""

import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError

from apps.accounts.models import Role, User, UserRole

PASSWORD = "Str0ng-Passw0rd!"


@pytest.fixture
def user() -> User:
    return get_user_model().objects.create_user(email="ana.perez@unal.edu.co", password=PASSWORD)


@pytest.mark.django_db
def test_rn_002_the_four_business_roles_exist() -> None:
    assert set(Role.objects.values_list("code", flat=True)) == {
        "STUDENT",
        "MONITOR",
        "TEACHER",
        "ADMIN",
    }


@pytest.mark.django_db
def test_rn_002_assigned_role_is_reported_by_the_user(user: User) -> None:
    UserRole.objects.create(user=user, role=Role.objects.get(code=Role.Code.STUDENT))

    assert user.has_role(Role.Code.STUDENT)
    assert not user.has_role(Role.Code.ADMIN)


@pytest.mark.django_db
def test_adr_008_user_holds_several_roles_simultaneously(user: User) -> None:
    for code in (Role.Code.STUDENT, Role.Code.MONITOR):
        UserRole.objects.create(user=user, role=Role.objects.get(code=code))

    assert user.has_role(Role.Code.STUDENT)
    assert user.has_role(Role.Code.MONITOR)
    assert set(user.roles.values_list("code", flat=True)) == {"STUDENT", "MONITOR"}


@pytest.mark.django_db
def test_rn_002_rejects_duplicate_role_assignment(user: User) -> None:
    student = Role.objects.get(code=Role.Code.STUDENT)
    UserRole.objects.create(user=user, role=student)

    with pytest.raises(IntegrityError):
        UserRole.objects.create(user=user, role=student)
