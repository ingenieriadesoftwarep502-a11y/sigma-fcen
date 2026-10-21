"""Catalog use cases that carry business rules beyond plain field validation.

Departments, subjects and new terms are plain CRUD validated by their serializers; courses and
monitor assignments also check the role of the person they reference (RN-002, RF-023, RF-024),
and editing a term's dates must keep its availability slots inside them.
"""

from datetime import date
from typing import Any

from django.db import transaction
from django.db.models import Max, Min

from apps.academics.models import AcademicTerm, Course, MonitorAssignment, Subject
from apps.accounts.models import Role, User
from apps.availability.domain.rules import LOCAL_TZ

TEACHER_ROLE_MESSAGE = "El usuario no tiene el rol Docente."
MONITOR_ROLE_MESSAGE = "El usuario no tiene el rol Monitor."
NOT_ASSIGNED_MESSAGE = "No tienes asignada esta asignatura como monitor en el período."


def slots_before_start_message(first_day: date) -> str:
    return (
        f"Hay franjas de disponibilidad del período desde el {first_day:%Y-%m-%d}; "
        "la fecha de inicio no puede ser posterior."
    )


def slots_after_end_message(last_day: date) -> str:
    return (
        f"Hay franjas de disponibilidad del período hasta el {last_day:%Y-%m-%d}; "
        "la fecha de fin no puede ser anterior."
    )


class CatalogRuleError(Exception):
    """A catalog rule rejected the operation; `field` names the offending input."""

    def __init__(self, field: str, message: str) -> None:
        super().__init__(message)
        self.field = field
        self.message = message


def _ensure_role(user: User, code: str, *, field: str, message: str) -> None:
    if not user.has_role(code):
        raise CatalogRuleError(field, message)


def _ensure_teacher(teacher: User | None) -> None:
    if teacher is not None:
        _ensure_role(teacher, Role.Code.TEACHER, field="teacher", message=TEACHER_ROLE_MESSAGE)


@transaction.atomic
def create_course(
    *, subject: Subject, term: AcademicTerm, group: str, teacher: User | None = None
) -> Course:
    """Offers a subject in a term; the teacher may be assigned later (RF-024)."""
    _ensure_teacher(teacher)
    return Course.objects.create(subject=subject, term=term, group=group, teacher=teacher)


@transaction.atomic
def update_course(course: Course, data: dict[str, Any]) -> Course:
    """Changes the group or the responsible teacher of a course."""
    if "teacher" in data:
        _ensure_teacher(data["teacher"])
    for field, value in data.items():
        setattr(course, field, value)
    if data:
        course.save(update_fields=list(data))
    return course


def _ensure_slots_inside(term: AcademicTerm, start_date: date, end_date: date) -> None:
    """Existing slots of the term must keep falling inside its new dates.

    A slot belongs to the term containing its local (Bogotá) start day, as when it was created.
    """
    span = term.availability_slots.aggregate(first=Min("starts_at"), last=Max("starts_at"))
    if span["first"] is None:
        return
    first_day = span["first"].astimezone(LOCAL_TZ).date()
    last_day = span["last"].astimezone(LOCAL_TZ).date()
    if start_date > first_day:
        raise CatalogRuleError("start_date", slots_before_start_message(first_day))
    if end_date < last_day:
        raise CatalogRuleError("end_date", slots_after_end_message(last_day))


@transaction.atomic
def update_term(term: AcademicTerm, data: dict[str, Any]) -> AcademicTerm:
    """Corrects a term's code or dates, e.g. extending one whose end date already passed."""
    term = AcademicTerm.objects.select_for_update().get(pk=term.pk)
    _ensure_slots_inside(
        term,
        data.get("start_date", term.start_date),
        data.get("end_date", term.end_date),
    )
    for field, value in data.items():
        setattr(term, field, value)
    if data:
        term.save(update_fields=list(data))
    return term


@transaction.atomic
def create_monitor_assignment(
    *, monitor: User, subject: Subject, term: AcademicTerm, committed_hours: int
) -> MonitorAssignment:
    """Authorizes a MONITOR role holder to attend a subject in a term (T-02.5, RF-023)."""
    _ensure_role(monitor, Role.Code.MONITOR, field="monitor", message=MONITOR_ROLE_MESSAGE)
    return MonitorAssignment.objects.create(
        monitor=monitor, subject=subject, term=term, committed_hours=committed_hours
    )


def is_monitor_assigned(monitor: User, subject: Subject, term: AcademicTerm) -> bool:
    """A monitor attends a subject only while holding the role and an assignment for that term.

    RN-003.5 and RN-002: revoking the MONITOR role withdraws the authorization even though the
    assignment row is kept as history.
    """
    return (
        monitor.has_role(Role.Code.MONITOR)
        and MonitorAssignment.objects.filter(monitor=monitor, subject=subject, term=term).exists()
    )


def ensure_monitor_assigned(monitor: User, subject: Subject, term: AcademicTerm) -> None:
    """Guard for FASE-03 onwards: a monitor without assignment cannot operate on the subject."""
    if not is_monitor_assigned(monitor, subject, term):
        raise CatalogRuleError("subject", NOT_ASSIGNED_MESSAGE)
