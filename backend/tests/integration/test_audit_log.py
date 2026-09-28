"""Append-only audit trail of sensitive operations (SAD D-6, CA-HU11-5)."""

import importlib

import pytest
from django.db import DatabaseError, IntegrityError, connection, transaction

from apps.accounts.models import AuditLog, AuditLogImmutableError, User

PASSWORD = "Str0ng-Passw0rd!"

append_only_migration = importlib.import_module(
    "apps.accounts.migrations.0006_audit_log_append_only"
)


@pytest.fixture
def entry(db: None) -> AuditLog:
    admin = User.objects.create_user(email="admin@unal.edu.co", password=PASSWORD)
    target = User.objects.create_user(email="ana.perez@unal.edu.co", password=PASSWORD)
    return AuditLog.objects.create(
        actor=admin,
        target=target,
        action=AuditLog.Action.USER_UPDATED,
        changes={"first_name": ["Ana", "Ana María"]},
    )


def test_d6_saved_entry_cannot_be_modified(entry: AuditLog) -> None:
    entry.changes = {"first_name": ["Ana", "Otra"]}

    with pytest.raises(AuditLogImmutableError):
        entry.save()

    entry.refresh_from_db()
    assert entry.changes == {"first_name": ["Ana", "Ana María"]}


def test_d6_entry_cannot_be_deleted(entry: AuditLog) -> None:
    with pytest.raises(AuditLogImmutableError):
        entry.delete()

    assert AuditLog.objects.filter(pk=entry.pk).exists()


def test_d6_entries_cannot_be_bulk_updated(entry: AuditLog) -> None:
    with pytest.raises(AuditLogImmutableError):
        AuditLog.objects.filter(pk=entry.pk).update(action=AuditLog.Action.USER_CREATED)


def test_d6_entries_cannot_be_bulk_deleted(entry: AuditLog) -> None:
    with pytest.raises(AuditLogImmutableError):
        AuditLog.objects.all().delete()

    assert AuditLog.objects.count() == 1


@pytest.mark.parametrize(
    "sql",
    [
        "UPDATE accounts_auditlog SET action = 'USER_CREATED' WHERE id = %s",
        "DELETE FROM accounts_auditlog WHERE id = %s",
    ],
)
def test_d6_database_trigger_blocks_raw_sql_changes(entry: AuditLog, sql: str) -> None:
    # The ORM guard can be bypassed with raw SQL; the trigger cannot.
    with pytest.raises(DatabaseError), transaction.atomic(), connection.cursor() as cursor:
        cursor.execute(sql, [entry.pk])

    entry.refresh_from_db()
    assert entry.action == AuditLog.Action.USER_UPDATED


def test_d6_reversing_the_trigger_migration_allows_changes_again(entry: AuditLog) -> None:
    # PostgreSQL DDL is transactional: the rollback restores the trigger for other tests.
    with transaction.atomic(), connection.cursor() as cursor:
        cursor.execute(append_only_migration.DROP_TRIGGER)
        cursor.execute(
            "UPDATE accounts_auditlog SET action = 'USER_CREATED' WHERE id = %s", [entry.pk]
        )
        assert cursor.rowcount == 1
        transaction.set_rollback(True)

    entry.refresh_from_db()
    assert entry.action == AuditLog.Action.USER_UPDATED


def test_d6_database_rejects_unknown_actions(entry: AuditLog) -> None:
    with pytest.raises(IntegrityError), transaction.atomic():
        AuditLog.objects.create(actor=entry.actor, target=entry.target, action="USER_ERASED")


def _index_orders() -> list[tuple[list[str], list[str]]]:
    with connection.cursor() as cursor:
        constraints = connection.introspection.get_constraints(cursor, "accounts_auditlog")
    return [
        (list(info["columns"]), [str(order) for order in info["orders"]])
        for info in constraints.values()
        if info["index"] and not info["primary_key"]
    ]


@pytest.mark.django_db
def test_ca_hu11_5_history_is_indexed_by_target_and_newest_first() -> None:
    indexes = _index_orders()

    # A user's history, newest first, and the global feed, newest first.
    assert (["target_id", "created_at"], ["ASC", "DESC"]) in indexes
    assert (["created_at"], ["DESC"]) in indexes
    # The composite index already serves lookups by target alone.
    assert (["target_id"], ["ASC"]) not in indexes
