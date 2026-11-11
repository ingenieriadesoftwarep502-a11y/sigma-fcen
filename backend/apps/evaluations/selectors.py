"""Read-side queries of the evaluations context (RF-063, RN-007.5, RF-062).

The monitor's average is one database aggregate, never a Python loop over the rows. Nothing
here returns the author of an evaluation to anyone but that author.
"""

from dataclasses import dataclass
from uuid import UUID

from django.conf import settings
from django.db.models import Avg, Count, Exists, OuterRef, QuerySet
from django.db.models.functions import Round

from apps.accounts.models import Role, User
from apps.evaluations.domain.rules import published_average
from apps.evaluations.models import Evaluation
from apps.reservations.domain.rules import ReservationStatus
from apps.reservations.models import Reservation
from apps.tutoring_sessions.domain.rules import AttendanceStatus
from apps.tutoring_sessions.selectors import student_history


@dataclass(frozen=True)
class MonitorRating:
    """`average` is None below the publication threshold ("sin datos suficientes")."""

    count: int
    average: float | None
    minimum: int

    @property
    def published(self) -> bool:
        return self.average is not None


def rated_monitor(pk: UUID) -> User | None:
    """A user who holds the monitor role, or None (the rating view answers 404)."""
    return User.objects.filter(pk=pk, roles__code=Role.Code.MONITOR).first()


def monitor_rating(monitor: User) -> MonitorRating:
    """RF-063: average of every evaluation of the monitor's sessions, rounded to 2 decimals."""
    totals = Evaluation.objects.filter(session__slot__monitor=monitor).aggregate(
        average=Round(Avg("rating"), 2), count=Count("id")
    )
    minimum = settings.EVALUATION_MIN_TO_PUBLISH
    raw = totals["average"]
    average = published_average(
        float(raw) if raw is not None else None, totals["count"], minimum=minimum
    )
    return MonitorRating(count=totals["count"], average=average, minimum=minimum)


def own_evaluations(student: User) -> QuerySet[Evaluation]:
    """The student's own evaluations, latest first, with the slot each one is about."""
    return (
        Evaluation.objects.filter(student=student)
        .select_related("session__slot__subject", "session__slot__monitor", "session__slot__term")
        .order_by("-created_at", "id")
    )


def pending_evaluations(student_id: UUID) -> QuerySet[Reservation]:
    """T-06.10: the student's attended sessions (COMPLETED) they have not evaluated yet."""
    evaluated = Evaluation.objects.filter(
        session_id=OuterRef("attendance__session_id"), student_id=OuterRef("student_id")
    )
    return (
        student_history(student_id, status=ReservationStatus.COMPLETED.value)
        .filter(attendance__attendance=AttendanceStatus.ATTENDED.value)
        .exclude(Exists(evaluated))
    )
