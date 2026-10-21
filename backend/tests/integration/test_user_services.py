"""User management use cases called directly, without the HTTP layer (HU-11)."""

import threading
from contextlib import suppress

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.accounts import services
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
    first_role_read = next(
        i for i, sql in enumerate(sqls) if '"accounts_role"' in sql and "FOR UPDATE" not in sql
    )
    assert target_lock < first_role_read
    assert AuditLog.objects.get().changes == {"roles": [[], ["MONITOR"]]}


@pytest.mark.django_db(transaction=True, serialized_rollback=True)
def test_rf_021_concurrent_admin_revocations_do_not_deadlock(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin_role = Role.objects.get(code=Role.Code.ADMIN)
    first, second, third = (
        User.objects.create_user(email=f"admin{i}@unal.edu.co", password=PASSWORD) for i in range(3)
    )
    for user in (first, second, third):
        UserRole.objects.create(user=user, role=admin_role)
    # Both transactions meet here once each holds its first lock, forcing the worst interleaving.
    barrier = threading.Barrier(2, timeout=2)
    read_roles = services._role_codes

    def meet_then_read(user: User) -> list[str]:
        with suppress(threading.BrokenBarrierError):
            barrier.wait()
        return read_roles(user)

    monkeypatch.setattr(services, "_role_codes", meet_then_read)
    errors: list[Exception] = []

    def revoke(actor: User, target: User) -> None:
        try:
            set_roles(actor=actor, user=target, roles=[Role.Code.STUDENT])
        except Exception as error:
            errors.append(error)
        finally:
            connection.close()

    threads = [
        threading.Thread(target=revoke, args=(first, second)),
        threading.Thread(target=revoke, args=(second, first)),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert errors == []
    assert list(User.objects.filter(roles__code=Role.Code.ADMIN)) == [third]
