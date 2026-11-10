"""Read-side queries of the tutoring-sessions context (RF-053, HU-12, RN-006.9).

Every listing joins or prefetches what its serializer prints, so a page costs a fixed number
of queries (RNF-PER-002, T-05.15).
"""

from uuid import UUID

from django.db.models import Prefetch, QuerySet

from apps.academics.models import Course
from apps.accounts.models import Role, User
from apps.reservations.domain.rules import SESSION_OUTCOMES
from apps.reservations.models import Reservation
from apps.tutoring_sessions.models import SessionAttendance, Topic, TutoringSession

CLOSED_STATUSES = sorted(status.value for status in SESSION_OUTCOMES)


def sessions_with_details() -> QuerySet[TutoringSession]:
    return TutoringSession.objects.select_related(
        "slot__subject", "slot__monitor", "slot__term", "recorded_by"
    ).prefetch_related(
        "topics",
        "materials",
        Prefetch(
            "attendances",
            queryset=SessionAttendance.objects.select_related("reservation__student").order_by(
                "reservation__student__first_name", "reservation__student__last_name", "id"
            ),
        ),
    )


def monitor_sessions(
    monitor: User, *, subject: int | None = None, term: str | None = None
) -> QuerySet[TutoringSession]:
    """The sessions of the monitor's slots, latest recorded first."""
    sessions = sessions_with_details().filter(slot__monitor=monitor)
    if subject is not None:
        sessions = sessions.filter(slot__subject_id=subject)
    if term is not None:
        sessions = sessions.filter(slot__term__code=term)
    return sessions.order_by("-recorded_at", "id")


def student_history(
    student_id: UUID, *, subject: int | None = None, status: str | None = None
) -> QuerySet[Reservation]:
    """HU-12: the student's reservations that already closed, latest slot first.

    COMPLETED and NO_SHOW, including late cancellations (ADR-011), which have no session.
    The session hangs from the reservation's own attendance, so a late canceller never sees
    the session the others attended.
    """
    history = (
        Reservation.objects.filter(student_id=student_id, status__in=CLOSED_STATUSES)
        .select_related("slot__subject", "slot__monitor", "slot__term", "attendance__session")
        .prefetch_related("attendance__session__topics")
    )
    if subject is not None:
        history = history.filter(slot__subject_id=subject)
    if status is not None:
        history = history.filter(status=status)
    return history.order_by("-slot__starts_at", "id")


def sees_everything(user: User, session: TutoringSession) -> bool:
    """The slot's monitor, the teacher of a course of that subject and term, or an admin."""
    slot = session.slot
    return (
        slot.monitor_id == user.pk
        or user.has_role(Role.Code.ADMIN)
        or Course.objects.filter(
            subject_id=slot.subject_id, term_id=slot.term_id, teacher=user
        ).exists()
    )


def attended_by(user: User, session: TutoringSession) -> bool:
    """A student whose reservation was marked in the session (RN-006.9)."""
    return any(row.reservation.student_id == user.pk for row in session.attendances.all())


def subject_topics(subject: int) -> QuerySet[Topic]:
    return Topic.objects.filter(subject_id=subject).order_by("name")
