"""Builders for evaluation test data (FASE-06). Not collected by pytest."""

from typing import Any

from apps.accounts.models import User
from apps.evaluations.models import Evaluation
from apps.reservations.domain.rules import ReservationStatus
from apps.reservations.models import Reservation
from apps.tutoring_sessions.domain.rules import AttendanceStatus
from apps.tutoring_sessions.models import TutoringSession
from tests.session_data import make_attendance


def make_evaluation(
    session: TutoringSession, student: User, rating: int = 5, **extra: Any
) -> Evaluation:
    """Inserts the row directly, bypassing the service: for state set-up only."""
    return Evaluation.objects.create(session=session, student=student, rating=rating, **extra)


def attend(
    session: TutoringSession,
    reservation: Reservation,
    attendance: AttendanceStatus = AttendanceStatus.ATTENDED,
) -> Reservation:
    """Marks the reservation in the session and closes it as the service would (RN-006.5)."""
    make_attendance(session, reservation, attendance)
    outcome = (
        ReservationStatus.COMPLETED
        if attendance == AttendanceStatus.ATTENDED
        else ReservationStatus.NO_SHOW
    )
    Reservation.objects.filter(pk=reservation.pk).update(status=outcome)
    reservation.refresh_from_db()
    return reservation
