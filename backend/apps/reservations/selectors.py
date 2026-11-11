"""Read-side queries of the reservations context (RF-045, RF-046, CA-HU11-3).

Every listing joins what its serializer prints, so a page costs a fixed number of queries
(RNF-PER-001).
"""

from django.db.models import Q, QuerySet
from django.utils import timezone

from apps.accounts.models import Role, User
from apps.reservations.domain.rules import ReservationStatus
from apps.reservations.models import Reservation

UPCOMING = "upcoming"
PAST = "past"

# Which side of the reservation the user is on (a person may hold both roles, ADR-008).
AS_STUDENT = "student"
AS_MONITOR = "monitor"


def reservations_with_details() -> QuerySet[Reservation]:
    return Reservation.objects.select_related(
        "slot__subject", "slot__monitor", "slot__term", "student", "cancelled_by"
    )


def _involving(user: User) -> Q:
    """The user booked it as a student, or it is on one of their slots as monitor."""
    return Q(student=user) | Q(slot__monitor=user)


def _side(user: User, role: str | None) -> Q:
    if role == AS_STUDENT:
        return Q(student=user)
    if role == AS_MONITOR:
        return Q(slot__monitor=user)
    return _involving(user)


def user_reservations(
    user: User, *, role: str | None = None, status: str | None = None, when: str | None = None
) -> QuerySet[Reservation]:
    """A student's own reservations and a monitor's reservations on their slots.

    `role` keeps one side only: "student" (booked by the user) or "monitor" (on the user's
    slots); without it both sides are listed, as before. Upcoming ones come soonest first;
    the past and the whole history, latest first.
    """
    reservations = reservations_with_details().filter(_side(user, role))
    if status is not None:
        reservations = reservations.filter(status=status)
    now = timezone.now()
    if when == UPCOMING:
        return reservations.filter(slot__starts_at__gt=now).order_by("slot__starts_at", "id")
    if when == PAST:
        reservations = reservations.filter(slot__starts_at__lte=now)
    return reservations.order_by("-slot__starts_at", "id")


def can_read(user: User, reservation: Reservation) -> bool:
    """Participants (the student and the slot's monitor) and administrators."""
    return (
        reservation.student_id == user.pk
        or reservation.slot.monitor_id == user.pk
        or user.has_role(Role.Code.ADMIN)
    )


def count_future_reservations(user: User) -> int:
    """CONFIRMED reservations still to happen, as student or as monitor (CA-HU11-3)."""
    return (
        Reservation.objects.filter(
            _involving(user),
            status=ReservationStatus.CONFIRMED.value,
            slot__starts_at__gt=timezone.now(),
        )
        .distinct()
        .count()
    )
