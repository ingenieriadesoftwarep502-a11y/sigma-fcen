"""User management use cases called directly, without the HTTP layer (HU-11)."""

import pytest

from apps.accounts.models import AuditLog, Role, User, UserRole
from apps.accounts.services import update_user

PASSWORD = "Str0ng-Passw0rd!"

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin() -> User:
    user = User.objects.create_user(email="admin@unal.edu.co", password=PASSWORD)
    UserRole.objects.create(user=user, role=Role.objects.get(code=Role.Code.ADMIN))
    return user


@pytest.fixture
def student() -> User:
    return User.objects.create_user(email="ana.perez@unal.edu.co", password=PASSWORD)


def test_rn_001_1_update_user_stores_a_new_email_in_lowercase(admin: User, student: User) -> None:
    update_user(actor=admin, user=student, data={"email": "Ana.Maria@UNAL.edu.co"})

    student.refresh_from_db()
    assert student.email == "ana.maria@unal.edu.co"
    assert AuditLog.objects.get().changes == {
        "email": ["ana.perez@unal.edu.co", "ana.maria@unal.edu.co"]
    }


def test_rn_001_1_update_user_ignores_a_case_only_email_change(admin: User, student: User) -> None:
    update_user(actor=admin, user=student, data={"email": "Ana.Perez@UNAL.edu.co"})

    student.refresh_from_db()
    assert student.email == "ana.perez@unal.edu.co"
    assert not AuditLog.objects.exists()
