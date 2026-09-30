"""Read-only catalog queries: listings with their filters, annotations and the summary.

Every listing runs a constant number of queries whatever the number of rows.
"""

from typing import Any
from uuid import UUID

from django.db.models import (
    CharField,
    Count,
    Exists,
    IntegerField,
    OuterRef,
    Prefetch,
    Q,
    QuerySet,
    Subquery,
    Sum,
    Value,
)
from django.db.models.functions import Coalesce, Concat

from apps.academics.models import AcademicTerm, Course, Department, MonitorAssignment, Subject
from apps.accounts.models import User

SUBJECT_ORDERINGS: dict[str, tuple[str, ...]] = {
    "name": ("name", "code"),
    "code": ("code",),
    "-monitor_count": ("-monitor_count", "name", "code"),
}
COURSE_ORDERINGS: dict[str, tuple[str, ...]] = {
    "name": ("subject__name", "subject__code", "group"),
    "code": ("subject__code", "group"),
    "-monitor_count": ("-monitor_count", "subject__name", "subject__code", "group"),
}


def current_term() -> AcademicTerm | None:
    return AcademicTerm.objects.current()


def _department_q(value: str, prefix: str = "") -> Q:
    """A department given by id (digits) or by code (codes always start with a letter)."""
    value = value.strip()
    if value.isdigit():
        return Q(**{f"{prefix}department_id": int(value)})
    return Q(**{f"{prefix}department__code": value.upper()})


def _person_search(term: str, prefix: str) -> Q:
    """Matches a person's email, first name, last name or "first last" (needs the alias)."""
    return (
        Q(**{f"{prefix}__email__icontains": term})
        | Q(**{f"{prefix}__first_name__icontains": term})
        | Q(**{f"{prefix}__last_name__icontains": term})
        | Q(**{f"{prefix}_full_name__icontains": term})
    )


def _full_name(prefix: str) -> Concat:
    return Concat(
        f"{prefix}__first_name", Value(" "), f"{prefix}__last_name", output_field=CharField()
    )


def _has_monitors_q(has_monitors: bool) -> Q:
    """Filters on the `monitor_count` annotation (a Q keeps the type checker off the alias)."""
    return Q(monitor_count__gt=0) if has_monitors else Q(monitor_count=0)


# --- Departments ---------------------------------------------------------------------------


def department_listing(*, only_active: bool, active: bool | None = None) -> QuerySet[Department]:
    """Non-administrators only ever see active departments."""
    departments = Department.objects.all()
    if only_active:
        return departments.filter(is_active=True)
    if active is not None:
        departments = departments.filter(is_active=active)
    return departments


# --- Subjects ------------------------------------------------------------------------------


def subjects_with_monitor_count(term: AcademicTerm | None) -> QuerySet[Subject]:
    """Subjects with their department and `monitor_count`: assignments in `term`."""
    subjects = Subject.objects.select_related("department")
    if term is None:
        return subjects.annotate(monitor_count=Value(0, output_field=IntegerField()))
    return subjects.annotate(
        monitor_count=Count("monitor_assignments", filter=Q(monitor_assignments__term=term))
    )


def subject_listing(
    *,
    term: AcademicTerm | None,
    only_active: bool,
    search: str = "",
    department: str | None = None,
    active: bool | None = None,
    credits: int | None = None,
    has_monitors: bool | None = None,
    ordering: str = "name",
) -> QuerySet[Subject]:
    subjects = subjects_with_monitor_count(term)
    if only_active:
        subjects = subjects.filter(is_active=True)
    elif active is not None:
        subjects = subjects.filter(is_active=active)
    text = search.strip()
    if text:
        subjects = subjects.filter(Q(code__icontains=text) | Q(name__icontains=text))
    if department:
        subjects = subjects.filter(_department_q(department))
    if credits is not None:
        subjects = subjects.filter(credits=credits)
    if has_monitors is not None:
        subjects = subjects.filter(_has_monitors_q(has_monitors))
    return subjects.order_by(*SUBJECT_ORDERINGS[ordering])


# --- Courses -------------------------------------------------------------------------------


def _assignments_of_course() -> QuerySet[MonitorAssignment]:
    return MonitorAssignment.objects.filter(subject=OuterRef("subject"), term=OuterRef("term"))


def courses_with_details() -> QuerySet[Course]:
    """Courses with subject, department, term and teacher joined and their `monitor_count`."""
    monitor_count = Subquery(
        _assignments_of_course()
        .order_by()
        .values("subject")
        .annotate(total=Count("pk"))
        .values("total"),
        output_field=IntegerField(),
    )
    return Course.objects.select_related("subject__department", "term", "teacher").annotate(
        monitor_count=Coalesce(monitor_count, 0)
    )


def course_listing(
    *,
    term: AcademicTerm | None,
    search: str = "",
    department: str | None = None,
    without_teacher: bool | None = None,
    without_monitors: bool | None = None,
    ordering: str = "name",
) -> QuerySet[Course]:
    if term is None:
        return Course.objects.none()
    courses = courses_with_details().filter(term=term)
    text = search.strip()
    if text:
        courses = courses.alias(teacher_full_name=_full_name("teacher")).filter(
            Q(subject__code__icontains=text)
            | Q(subject__name__icontains=text)
            | _person_search(text, "teacher")
        )
    if department:
        courses = courses.filter(_department_q(department, prefix="subject__"))
    if without_teacher is not None:
        courses = courses.filter(teacher__isnull=without_teacher)
    if without_monitors is not None:
        courses = courses.filter(_has_monitors_q(not without_monitors))
    return courses.order_by(*COURSE_ORDERINGS[ordering])


def teacher_courses(teacher: User, term: AcademicTerm | None) -> QuerySet[Course]:
    """Only the teacher's own courses (RN-009.1), with the monitors of each subject in `term`.

    The monitors land in `course.subject.term_assignments`.
    """
    if term is None:
        return Course.objects.none()
    assignments = (
        MonitorAssignment.objects.filter(term=term)
        .select_related("monitor")
        .order_by("monitor__email")
    )
    return (
        Course.objects.filter(teacher=teacher, term=term)
        .select_related("subject__department", "term")
        .prefetch_related(
            Prefetch(
                "subject__monitor_assignments", queryset=assignments, to_attr="term_assignments"
            )
        )
        .order_by("subject__name", "subject__code", "group")
    )


# --- Monitor assignments -------------------------------------------------------------------


def assignment_listing(
    *,
    term: AcademicTerm | None,
    subject: int | None = None,
    monitor: UUID | None = None,
    search: str = "",
) -> QuerySet[MonitorAssignment]:
    if term is None:
        return MonitorAssignment.objects.none()
    assignments = MonitorAssignment.objects.filter(term=term).select_related(
        "monitor", "subject", "term"
    )
    if subject is not None:
        assignments = assignments.filter(subject_id=subject)
    if monitor is not None:
        assignments = assignments.filter(monitor_id=monitor)
    text = search.strip()
    if text:
        assignments = assignments.alias(monitor_full_name=_full_name("monitor")).filter(
            Q(subject__code__icontains=text)
            | Q(subject__name__icontains=text)
            | _person_search(text, "monitor")
        )
    return assignments.order_by("subject__name", "subject__code", "monitor__email")


def monitor_assignments(monitor: User, term: AcademicTerm | None) -> QuerySet[MonitorAssignment]:
    """Only the monitor's own assignments in `term`, with the teachers of each subject.

    The subject's courses in `term` that have a teacher land in `assignment.subject.term_courses`.
    """
    if term is None:
        return MonitorAssignment.objects.none()
    courses = (
        Course.objects.filter(term=term, teacher__isnull=False)
        .select_related("teacher")
        .order_by("group", "teacher__email")
    )
    return (
        MonitorAssignment.objects.filter(monitor=monitor, term=term)
        .select_related("subject__department", "term")
        .prefetch_related(Prefetch("subject__courses", queryset=courses, to_attr="term_courses"))
        .order_by("subject__name", "subject__code")
    )


# --- Summary -------------------------------------------------------------------------------


def catalog_summary(term: AcademicTerm | None) -> dict[str, Any]:
    """Headline numbers of the catalog for the admin dashboard, for one term."""
    summary: dict[str, Any] = {
        "term": term.code if term else None,
        "subjects_active": Subject.objects.filter(is_active=True).count(),
        "departments_active": Department.objects.filter(is_active=True).count(),
        "courses": 0,
        "courses_without_teacher": 0,
        "courses_without_monitor": 0,
        "monitor_assignments": 0,
        "committed_hours_total": 0,
    }
    if term is None:
        return summary
    summary.update(
        Course.objects.filter(term=term)
        .alias(has_monitor=Exists(_assignments_of_course()))
        .aggregate(
            courses=Count("pk"),
            courses_without_teacher=Count("pk", filter=Q(teacher__isnull=True)),
            courses_without_monitor=Count("pk", filter=Q(has_monitor=False)),
        )
    )
    summary.update(
        MonitorAssignment.objects.filter(term=term).aggregate(
            monitor_assignments=Count("pk"),
            committed_hours_total=Coalesce(Sum("committed_hours"), 0),
        )
    )
    return summary
