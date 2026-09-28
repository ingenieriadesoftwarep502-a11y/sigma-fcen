"""Identity use cases that span several models in one transaction."""

from collections.abc import Iterable

from django.db import transaction

from apps.accounts.models import AuditLog, Role, User, UserRole


@transaction.atomic
def register_student(*, email: str, password: str, first_name: str, last_name: str) -> User:
    """Self-registration always yields an active student and nothing else (RN-001.4, ADR-009)."""
    user = User.objects.create_user(
        email=email, password=password, first_name=first_name, last_name=last_name
    )
    UserRole.objects.create(user=user, role=Role.objects.get(code=Role.Code.STUDENT))
    return user


def _role_codes(user: User) -> list[str]:
    return sorted(user.roles.values_list("code", flat=True))


def _replace_roles(user: User, codes: Iterable[str]) -> None:
    user.user_roles.all().delete()
    UserRole.objects.bulk_create(
        UserRole(user=user, role=role) for role in Role.objects.filter(code__in=set(codes))
    )


@transaction.atomic
def create_user(
    *,
    actor: User,
    email: str,
    password: str,
    first_name: str,
    last_name: str,
    roles: list[str],
) -> User:
    """An administrator creates an active account with any roles (CA-HU11-1, ADR-009)."""
    user = User.objects.create_user(
        email=email, password=password, first_name=first_name, last_name=last_name
    )
    _replace_roles(user, roles)
    AuditLog.objects.create(
        actor=actor,
        target=user,
        action=AuditLog.Action.USER_CREATED,
        changes={
            "email": user.email,
            "first_name": first_name,
            "last_name": last_name,
            "roles": _role_codes(user),
        },
    )
    return user
