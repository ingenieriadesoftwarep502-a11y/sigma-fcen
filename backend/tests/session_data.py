"""Builders for tutoring-session test data (FASE-05). Not collected by pytest."""

from datetime import datetime, timedelta
from typing import Any

from django.utils import timezone

from apps.academics.models import AcademicTerm, Subject
from apps.accounts.models import User
from apps.availability.models import AvailabilitySlot
from apps.reservations.models import Reservation
from apps.tutoring_sessions.domain.rules import AttendanceStatus
from apps.tutoring_sessions.models import SessionAttendance, Topic, TutoringSession
from tests.availability_data import make_slot

MINUTE = timedelta(minutes=1)


def started_at(hours_ago: int = 2) -> datetime:
    """A slot start already in the past, on the hour (slots start on the hour or half hour)."""
    return timezone.now().replace(minute=0, second=0, microsecond=0) - timedelta(hours=hours_ago)


def make_started_slot(
    monitor: User, subject: Subject, term: AcademicTerm, hours_ago: int = 2, **extra: Any
) -> AvailabilitySlot:
    """Inserts a slot that already started; the services refuse to create one in the past."""
    return make_slot(monitor, subject, term, starts_at=started_at(hours_ago), **extra)


def make_topic(subject: Subject, name: str = "Regla de la cadena", **extra: Any) -> Topic:
    return Topic.objects.create(subject=subject, name=name, **extra)


def make_session(slot: AvailabilitySlot, **extra: Any) -> TutoringSession:
    """Inserts the row directly, bypassing the service: for state set-up only."""
    extra.setdefault("recorded_by", slot.monitor)
    extra.setdefault("duration_minutes", (slot.ends_at - slot.starts_at) // MINUTE)
    return TutoringSession.objects.create(slot=slot, **extra)


def make_attendance(
    session: TutoringSession,
    reservation: Reservation,
    attendance: AttendanceStatus = AttendanceStatus.ATTENDED,
) -> SessionAttendance:
    return SessionAttendance.objects.create(
        session=session, reservation=reservation, attendance=attendance.value
    )
