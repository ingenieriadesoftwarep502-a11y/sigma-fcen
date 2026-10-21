"""Read-only queries of the accounts context, shared by the admin list, summary and export."""

from datetime import timedelta
from typing import Any

from django.db.models import CharField, Count, Q, QuerySet, Value
from django.db.models.functions import Concat
from django.utils import timezone

from apps.accounts.models import AuditLog, Role, User

RECENT_ACTIVITY_LIMIT = 10
RECENT_SIGNUP_DAYS = 30


def filter_users(
    users: QuerySet[User],
    *,
    search: str = "",
    role: str | None = None,
    is_active: bool | None = None,
) -> QuerySet[User]:
    """Narrows an admin user listing; empty arguments leave it untouched.

    `search` matches email, first name, last name or "first last", ignoring case.
    Filtering by one role code cannot duplicate users: (user, role) is unique.
    """
    term = search.strip()
    if term:
        users = users.alias(
            full_name=Concat("first_name", Value(" "), "last_name", output_field=CharField())
        ).filter(
            Q(email__icontains=term)
            | Q(first_name__icontains=term)
            | Q(last_name__icontains=term)
            | Q(full_name__icontains=term)
        )
    if role is not None:
        users = users.filter(roles__code=role)
    if is_active is not None:
        users = users.filter(is_active=is_active)
    return users


def admin_user_listing() -> QuerySet[User]:
    """Every account with its roles preloaded, in a stable order."""
    return User.objects.prefetch_related("roles").order_by("email")


def user_summary() -> dict[str, Any]:
    """Headline numbers and the latest audit entries for the admin dashboard.

    Three queries whatever the volume: user totals, users per role and the audit feed.
    """
    since = timezone.now() - timedelta(days=RECENT_SIGNUP_DAYS)
    totals = User.objects.aggregate(
        total=Count("pk"),
        active=Count("pk", filter=Q(is_active=True)),
        joined_last_30_days=Count("pk", filter=Q(date_joined__gte=since)),
    )
    by_role = dict.fromkeys(Role.Code.values, 0)
    by_role.update(
        Role.objects.annotate(users_count=Count("user_roles")).values_list("code", "users_count")
    )
    recent_activity = list(
        AuditLog.objects.select_related("actor", "target").order_by("-created_at", "-pk")[
            :RECENT_ACTIVITY_LIMIT
        ]
    )
    return {
        "total": totals["total"],
        "active": totals["active"],
        "inactive": totals["total"] - totals["active"],
        "joined_last_30_days": totals["joined_last_30_days"],
        "by_role": by_role,
        "recent_activity": recent_activity,
    }
