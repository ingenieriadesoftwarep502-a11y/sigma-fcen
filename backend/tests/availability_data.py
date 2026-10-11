"""Builders for availability test data (FASE-03). Not collected by pytest.

Dates are relative to today so the suite never ages: the term always contains today and
SLOT_START is a future weekday morning in Bogotá.
"""

from datetime import date, datetime, time, timedelta
from typing import Any

from django.utils import timezone

from apps.academics.models import AcademicTerm, Subject
from apps.accounts.models import Role, User
from apps.availability.domain.rules import LOCAL_TZ
from apps.availability.models import AvailabilitySlot
from tests.catalog_data import make_assignment, make_subject, make_term, make_user

HOUR = timedelta(hours=1)
TERM_CODE = "2026-2"

# A monitor with the subject and term they are assigned to.
Owner = tuple[User, Subject, AcademicTerm]


def local_datetime(day: date, at: time) -> datetime:
    return datetime.combine(day, at, tzinfo=LOCAL_TZ)


def next_weekday(weekday: int, after: date | None = None) -> date:
    """The first `weekday` (Monday = 0) strictly after `after` (default: today in Bogotá)."""
    start = after or timezone.localdate(timezone=LOCAL_TZ)
    return start + timedelta(days=(weekday - start.weekday() - 1) % 7 + 1)


# Next Tuesday, 10:00 in Bogotá.
SLOT_START = local_datetime(next_weekday(1), time(10, 0))


def current_term() -> AcademicTerm:
    today = timezone.localdate(timezone=LOCAL_TZ)
    return AcademicTerm.objects.filter(code=TERM_CODE).first() or make_term(
        TERM_CODE, today - timedelta(days=30), today + timedelta(days=60)
    )


def make_assigned_monitor(
    email: str = "monitor@unal.edu.co",
    subject: Subject | None = None,
    term: AcademicTerm | None = None,
) -> "Owner":
    subject = subject or Subject.objects.first() or make_subject()
    term = term or current_term()
    monitor = make_user(email, Role.Code.MONITOR)
    make_assignment(monitor, subject, term)
    return monitor, subject, term


def make_slot(
    monitor: User,
    subject: Subject,
    term: AcademicTerm,
    starts_at: datetime = SLOT_START,
    **extra: Any,
) -> AvailabilitySlot:
    extra.setdefault("ends_at", starts_at + HOUR)
    extra.setdefault("location", "Edificio 404, aula 201")
    return AvailabilitySlot.objects.create(
        monitor=monitor, subject=subject, term=term, starts_at=starts_at, **extra
    )
