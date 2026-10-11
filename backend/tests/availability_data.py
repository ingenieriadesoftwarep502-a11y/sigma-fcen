"""Builders for availability test data (FASE-03). Not collected by pytest."""

from datetime import UTC, datetime, timedelta
from typing import Any

from apps.academics.models import AcademicTerm, Subject
from apps.accounts.models import Role, User
from apps.availability.models import AvailabilitySlot
from tests.catalog_data import make_assignment, make_subject, make_term, make_user

# Tuesday 2026-10-20, 10:00 in Bogotá; inside the default 2026-2 test term.
SLOT_START = datetime(2026, 10, 20, 15, 0, tzinfo=UTC)
HOUR = timedelta(hours=1)


def make_assigned_monitor(
    email: str = "monitor@unal.edu.co",
    subject: Subject | None = None,
    term: AcademicTerm | None = None,
) -> tuple[User, Subject, AcademicTerm]:
    subject = subject or Subject.objects.first() or make_subject()
    term = term or AcademicTerm.objects.filter(code="2026-2").first() or make_term()
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
