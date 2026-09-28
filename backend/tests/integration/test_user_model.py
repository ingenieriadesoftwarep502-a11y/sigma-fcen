"""Custom user model identified by institutional email (T-01.1, T-01.3, RN-001.1, ADR-008)."""

import uuid

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db import IntegrityError, connection, migrations
from django.db.migrations.loader import MigrationLoader

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
