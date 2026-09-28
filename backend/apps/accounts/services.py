"""Identity use cases that span several models in one transaction."""

from collections.abc import Iterable
from typing import Any

from django.db import transaction

from apps.accounts.domain.rules import AdminChange, ensure_admin_remains
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


def _ensure_admin_remains(*, actor: User, user: User, change: AdminChange) -> None:
    """Checks the lockout rule against the active admins, locked until the transaction ends.

    Locking the admin rows serializes concurrent demotions and deactivations, so two
    administrators cannot remove each other at the same time and leave none behind.
    """
    active_admins = set(
        User.objects.select_for_update(of=("self",))
        .filter(is_active=True, roles__code=Role.Code.ADMIN)
        .values_list("pk", flat=True)
    )
    ensure_admin_remains(
        change=change,
        by_self=actor.pk == user.pk,
        target_is_active_admin=user.pk in active_admins,
        other_active_admins=len(active_admins - {user.pk}),
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
            "email": [None, user.email],
            "first_name": [None, first_name],
            "last_name": [None, last_name],
            "roles": [[], _role_codes(user)],
        },
    )
    return user


@transaction.atomic
def update_user(*, actor: User, user: User, data: dict[str, Any]) -> User:
    """Edits identity fields or reactivates the account; deactivation has its own flow."""
    changes = {
        field: [getattr(user, field), value]
        for field, value in data.items()
        if getattr(user, field) != value
    }
    if not changes:
        return user
    if changes.get("is_active") == [True, False]:
        _ensure_admin_remains(actor=actor, user=user, change=AdminChange.DEACTIVATE)
    for field, (_, value) in changes.items():
        setattr(user, field, value)
    user.save(update_fields=list(changes))
    reactivated = changes.get("is_active") == [False, True]
    AuditLog.objects.create(
        actor=actor,
        target=user,
        action=AuditLog.Action.USER_ACTIVATED if reactivated else AuditLog.Action.USER_UPDATED,
        changes=changes,
    )
    return user


@transaction.atomic
def set_roles(*, actor: User, user: User, roles: list[str]) -> User:
    """Replaces the user's roles: assigns the new ones and removes the rest (RF-021)."""
    before = _role_codes(user)
    if Role.Code.ADMIN in before and Role.Code.ADMIN not in roles:
        _ensure_admin_remains(actor=actor, user=user, change=AdminChange.REVOKE_ADMIN)
    _replace_roles(user, roles)
    after = _role_codes(user)
    if before != after:
        AuditLog.objects.create(
            actor=actor,
            target=user,
            action=AuditLog.Action.ROLES_CHANGED,
            changes={"roles": [before, after]},
        )
    return user


def count_future_reservations(user: User) -> int:
    """Reservations arrive in FASE-04; until then no account has any (technical debt, T-01.12)."""
    return 0


def deactivation_impact(user: User) -> dict[str, int]:
    """What deactivating the account would affect, shown before confirming (CA-HU11-3)."""
    return {"future_reservations": count_future_reservations(user)}


@transaction.atomic
def deactivate_user(*, actor: User, user: User) -> dict[str, int]:
    """Blocks the account at once: its tokens stop working on the next request (CA-HU11-2)."""
    impact = deactivation_impact(user)
    if user.is_active:
        _ensure_admin_remains(actor=actor, user=user, change=AdminChange.DEACTIVATE)
        user.is_active = False
        user.save(update_fields=["is_active"])
        AuditLog.objects.create(
            actor=actor,
            target=user,
            action=AuditLog.Action.USER_DEACTIVATED,
            changes={"is_active": [True, False]},
            context=impact,
        )
    return impact
