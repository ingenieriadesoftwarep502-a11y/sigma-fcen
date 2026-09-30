"""Seed the four business roles (DDD section 2: STUDENT, MONITOR, TEACHER, ADMIN)."""

from django.apps.registry import Apps
from django.db import migrations
from django.db.backends.base.schema import BaseDatabaseSchemaEditor

ROLE_CODES = ("STUDENT", "MONITOR", "TEACHER", "ADMIN")


def seed_roles(apps: Apps, schema_editor: BaseDatabaseSchemaEditor) -> None:
    role_model = apps.get_model("accounts", "Role")
    for code in ROLE_CODES:
        role_model.objects.get_or_create(code=code)


def remove_roles(apps: Apps, schema_editor: BaseDatabaseSchemaEditor) -> None:
    # UserRole.role is PROTECT: roles already assigned to users are kept.
    role_model = apps.get_model("accounts", "Role")
    role_model.objects.filter(code__in=ROLE_CODES, user_roles__isnull=True).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0002_roles"),
    ]

    operations = [
        migrations.RunPython(seed_roles, remove_roles),
    ]
