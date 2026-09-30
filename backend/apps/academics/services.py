"""Catalog use cases that carry business rules beyond plain field validation.

Departments, subjects and terms are plain CRUD validated by their serializers; courses and
monitor assignments also check the role of the person they reference (RN-002, RF-023, RF-024).
"""

from typing import Any

from django.db import transaction

from apps.academics.models import AcademicTerm, Course, MonitorAssignment, Subject
from apps.accounts.models import Role, User

TEACHER_ROLE_MESSAGE = "El usuario no tiene el rol Docente."
MONITOR_ROLE_MESSAGE = "El usuario no tiene el rol Monitor."


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


@transaction.atomic
def create_monitor_assignment(
    *, monitor: User, subject: Subject, term: AcademicTerm, committed_hours: int
) -> MonitorAssignment:
    """Authorizes a MONITOR role holder to attend a subject in a term (T-02.5, RF-023)."""
    _ensure_role(monitor, Role.Code.MONITOR, field="monitor", message=MONITOR_ROLE_MESSAGE)
    return MonitorAssignment.objects.create(
        monitor=monitor, subject=subject, term=term, committed_hours=committed_hours
    )
