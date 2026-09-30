"""Reversibility of the role seed migration (RN-002, DDD section 2)."""

import importlib

import pytest
from django.apps import apps
from django.db import connection

from apps.accounts.models import Role, User, UserRole

seed_migration = importlib.import_module("apps.accounts.migrations.0003_seed_roles")

pytestmark = pytest.mark.django_db


def _reverse_seed() -> None:
    # The data migration never touches the schema, so the editor is not entered.
    seed_migration.remove_roles(apps, connection.schema_editor())


def test_rn_002_reversing_the_seed_keeps_roles_that_are_assigned() -> None:
    user = User.objects.create_user(email="ana@unal.edu.co", password="Str0ng-Passw0rd!")
    UserRole.objects.create(user=user, role=Role.objects.get(code=Role.Code.STUDENT))

    _reverse_seed()

    assert set(Role.objects.values_list("code", flat=True)) == {Role.Code.STUDENT}
    assert user.has_role(Role.Code.STUDENT)


def test_rn_002_reversing_the_seed_removes_unassigned_roles() -> None:
    _reverse_seed()

    assert not Role.objects.exists()
