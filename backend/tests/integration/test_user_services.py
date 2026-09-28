"""User management use cases called directly, without the HTTP layer (HU-11)."""

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.accounts.models import AuditLog, Role, User, UserRole
from apps.accounts.services import set_roles, update_user

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


def test_rf_021_set_roles_locks_the_target_before_reading_its_roles(
    admin: User, student: User
) -> None:
    # Without the lock, two concurrent assignments read the same "before" and the audit lies.
    with CaptureQueriesContext(connection) as queries:
        set_roles(actor=admin, user=student, roles=[Role.Code.MONITOR])

    sqls = [query["sql"] for query in queries.captured_queries]
    target_lock = next(
        i
        for i, sql in enumerate(sqls)
        if "FOR UPDATE" in sql and 'FROM "accounts_user"' in sql and student.pk.hex in sql
    )
    first_role_read = next(i for i, sql in enumerate(sqls) if '"accounts_role"' in sql)
    assert target_lock < first_role_read
    assert AuditLog.objects.get().changes == {"roles": [[], ["MONITOR"]]}
