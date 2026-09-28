"""Custom user model identified by institutional email (T-01.1, T-01.3, RN-001.1, ADR-008)."""

import uuid
from types import SimpleNamespace
from typing import Any

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db import IntegrityError, connection, migrations
from django.db.migrations.loader import MigrationLoader
from django.test.utils import CaptureQueriesContext

from apps.accounts.models import Role
from shared.permissions import IsAdmin

PASSWORD = "Str0ng-Passw0rd!"


def test_t01_3_auth_user_model_points_to_accounts_user() -> None:
    assert settings.AUTH_USER_MODEL == "accounts.User"


@pytest.mark.django_db
def test_t01_3_initial_accounts_migration_creates_user_and_nothing_is_pending() -> None:
    loader = MigrationLoader(connection)
    initial = loader.get_migration("accounts", "0001_initial")

    assert initial.initial
    assert "user" in {
        op.name_lower for op in initial.operations if isinstance(op, migrations.CreateModel)
    }
    call_command("makemigrations", "--check", "--dry-run", verbosity=0)


@pytest.mark.django_db
def test_rn_001_1_creates_user_identified_by_email() -> None:
    user = get_user_model().objects.create_user(
        email="ana.perez@unal.edu.co",
        password=PASSWORD,
        first_name="Ana",
        last_name="Pérez",
    )

    assert isinstance(user.pk, uuid.UUID)
    assert user.email == "ana.perez@unal.edu.co"
    assert get_user_model().USERNAME_FIELD == "email"
    assert not hasattr(user, "username")
    assert user.is_active
    assert not user.is_staff
    assert user.check_password(PASSWORD)
    assert user.date_joined is not None


@pytest.mark.django_db
def test_rn_001_1_rejects_duplicate_email() -> None:
    user_model = get_user_model()
    user_model.objects.create_user(email="ana.perez@unal.edu.co", password=PASSWORD)

    with pytest.raises(IntegrityError):
        user_model.objects.create_user(email="ana.perez@unal.edu.co", password=PASSWORD)


@pytest.mark.django_db
def test_rn_001_1_rejects_duplicate_email_differing_only_in_case() -> None:
    user_model = get_user_model()
    user_model.objects.create_user(email="ana.perez@unal.edu.co", password=PASSWORD)

    with pytest.raises(IntegrityError):
        user_model.objects.create_user(email="Ana.Perez@UNAL.edu.co", password=PASSWORD)


@pytest.mark.django_db
def test_t01_1_create_user_requires_email() -> None:
    with pytest.raises(ValueError, match="email"):
        get_user_model().objects.create_user(email="", password=PASSWORD)


@pytest.mark.django_db
def test_t01_1_create_superuser_grants_admin_site_access() -> None:
    admin = get_user_model().objects.create_superuser(email="admin@unal.edu.co", password=PASSWORD)

    assert admin.is_staff
    assert admin.is_superuser
    assert admin.is_active


@pytest.mark.django_db
def test_rn_001_1_create_user_stores_the_whole_email_in_lowercase() -> None:
    user = get_user_model().objects.create_user(email="Ana.Perez@UNAL.edu.co", password=PASSWORD)

    user.refresh_from_db()
    assert user.email == "ana.perez@unal.edu.co"


@pytest.mark.django_db
def test_rn_001_1_natural_key_lookup_is_case_insensitive_and_uses_exact_match() -> None:
    user_model = get_user_model()
    user = user_model.objects.create_user(email="ana.perez@unal.edu.co", password=PASSWORD)

    with CaptureQueriesContext(connection) as queries:
        found = user_model.objects.get_by_natural_key("Ana.Perez@UNAL.edu.co")

    assert found == user
    # An exact match on the stored lowercase value can use the unique index.
    assert "UPPER(" not in queries[0]["sql"]
    assert "LOWER(" not in queries[0]["sql"]


def _passes_is_admin(user: Any) -> bool:
    return IsAdmin().has_permission(SimpleNamespace(user=user), None)  # type: ignore[arg-type]


@pytest.mark.django_db
def test_rn_002_create_superuser_also_holds_the_admin_business_role() -> None:
    admin = get_user_model().objects.create_superuser(email="admin@unal.edu.co", password=PASSWORD)

    assert _passes_is_admin(admin)


@pytest.mark.django_db
def test_rn_002_createsuperuser_command_yields_a_business_admin() -> None:
    call_command("createsuperuser", "--noinput", email="Admin@UNAL.edu.co", verbosity=0)

    admin = get_user_model().objects.get(email="admin@unal.edu.co")
    assert admin.is_superuser
    assert _passes_is_admin(admin)


@pytest.mark.django_db
@pytest.mark.parametrize("flag", ["is_staff", "is_superuser"])
def test_t01_1_create_superuser_rejects_false_flags(flag: str) -> None:
    with pytest.raises(ValueError, match=flag):
        get_user_model().objects.create_superuser(
            email="admin@unal.edu.co", password=PASSWORD, **{flag: False}
        )


@pytest.mark.django_db
def test_rn_002_create_superuser_is_atomic_with_the_admin_role() -> None:
    Role.objects.filter(code=Role.Code.ADMIN).delete()

    with pytest.raises(Role.DoesNotExist):
        get_user_model().objects.create_superuser(email="admin@unal.edu.co", password=PASSWORD)

    assert not get_user_model().objects.exists()
