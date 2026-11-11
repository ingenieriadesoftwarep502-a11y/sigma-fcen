"""Read-side queries of the teacher's follow-up (FASE-08, HU-09, RF-080 to RF-083).

Every query starts from the teacher's own courses (RN-009.1), so the course filter is always
applied on the server. A session belongs to a course when its slot has the course's subject
and term (see `domain.rules`). Counts are database aggregates, and each listing costs a fixed
number of queries whatever its size (RNF-PER-002).
"""

from datetime import date
from typing import Any

from django.db.models import (
    Count,
    Exists,
    IntegerField,
    Max,
    OuterRef,
    Prefetch,
    QuerySet,
    Subquery,
)
from django.db.models.functions import Coalesce, Lower

from apps.academics.models import AcademicTerm, Course, MonitorAssignment
from apps.accounts.models import User
from apps.analytics.domain.rules import (
    FREQUENT_TOPICS_ORDERING,
    ensure_own_course,
    local_day_bounds,
)
from apps.tutoring_sessions.domain.rules import AttendanceStatus
from apps.tutoring_sessions.models import SessionAttendance, Topic, TutoringSession

ATTENDED = AttendanceStatus.ATTENDED.value
# Where `teacher_sessions` leaves the attendance rows of the students who came.
ATTENDEES = "attendees"


def _count(rows: QuerySet[Any], group_by: str, counted: str, *, distinct: bool = False) -> Any:
    """A correlated COUNT subquery, 0 when there are no rows."""
    total = (
        rows.order_by()
        .values(group_by)
        .annotate(total=Count(counted, distinct=distinct))
        .values("total")
    )
    return Coalesce(Subquery(total, output_field=IntegerField()), 0)


# --- Scope -----------------------------------------------------------------------------------


def teacher_scope(
    teacher: User, *, course: int | None = None, term: AcademicTerm | None = None
) -> QuerySet[Course]:
    """The teacher's courses a request covers: one course, or all of theirs in `term`.

    A course that is not theirs (or does not exist) raises TeachingForbiddenError (403).
    With neither a course nor a term there is nothing to read: an empty scope.
    """
    if course is not None:
        own = Course.objects.filter(pk=course, teacher=teacher)
        ensure_own_course(owned=own.exists())
        return own
    if term is None:
        return Course.objects.none()
    return Course.objects.filter(teacher=teacher, term=term)


def _in_scope(courses: QuerySet[Course], subject: str, term: str) -> Exists:
    """True when a course of the scope has the row's subject and term."""
    return Exists(courses.filter(subject_id=OuterRef(subject), term_id=OuterRef(term)))


def scoped_sessions(
    courses: QuerySet[Course], *, date_from: date | None = None, date_to: date | None = None
) -> QuerySet[TutoringSession]:
    """The recorded sessions of the scope, optionally within whole local days."""
    start, end = local_day_bounds(date_from, date_to)
    sessions = TutoringSession.objects.filter(
        _in_scope(courses, "slot__subject_id", "slot__term_id")
    )
    if start is not None:
        sessions = sessions.filter(slot__starts_at__gte=start)
    if end is not None:
        sessions = sessions.filter(slot__starts_at__lt=end)
    return sessions


# --- Courses ---------------------------------------------------------------------------------


def course_indicators(courses: QuerySet[Course]) -> QuerySet[Course]:
    """Courses with their monitors, recorded sessions and distinct students who attended."""
    same_course = {"subject_id": OuterRef("subject_id"), "term_id": OuterRef("term_id")}
    sessions = TutoringSession.objects.filter(
        slot__subject_id=OuterRef("subject_id"), slot__term_id=OuterRef("term_id")
    )
    attendances = SessionAttendance.objects.filter(
        session__slot__subject_id=OuterRef("subject_id"),
        session__slot__term_id=OuterRef("term_id"),
        attendance=ATTENDED,
    )
    return (
        courses.select_related("subject", "term")
        .annotate(
            monitor_count=_count(MonitorAssignment.objects.filter(**same_course), "term_id", "pk"),
            session_count=_count(sessions, "slot__term_id", "pk"),
            student_count=_count(
                attendances, "session__slot__term_id", "reservation__student_id", distinct=True
            ),
        )
        .order_by("subject__name", "subject__code", "group", "pk")
    )


def teacher_course(teacher: User, course: int) -> Course:
    """One of the teacher's courses with its indicators; 403 when it is not theirs."""
    return course_indicators(teacher_scope(teacher, course=course)).get()


# --- Monitors (RF-080, CA-HU09-1) -------------------------------------------------------------


def scoped_monitors(courses: QuerySet[Course]) -> QuerySet[MonitorAssignment]:
    """The monitor assignments of the scope's subjects and terms, with their session count.

    One row per assignment: a monitor of a subject the teacher has two groups of shows once.
    """
    sessions = TutoringSession.objects.filter(
        slot__monitor_id=OuterRef("monitor_id"),
        slot__subject_id=OuterRef("subject_id"),
        slot__term_id=OuterRef("term_id"),
    )
    return (
        MonitorAssignment.objects.filter(_in_scope(courses, "subject_id", "term_id"))
        .select_related("monitor", "subject", "term")
        .annotate(session_count=_count(sessions, "slot__monitor_id", "pk"))
        .order_by(
            "subject__name", "monitor__first_name", "monitor__last_name", "monitor__email", "pk"
        )
    )


# --- Sessions (RF-081, CA-HU09-2) -------------------------------------------------------------


def teacher_sessions(sessions: QuerySet[TutoringSession]) -> QuerySet[TutoringSession]:
    """Sessions latest first, with the topics and only the students who attended."""
    attendees = (
        SessionAttendance.objects.filter(attendance=ATTENDED)
        .select_related("reservation__student")
        .order_by("reservation__student__first_name", "reservation__student__last_name", "pk")
    )
    return (
        sessions.select_related("slot__subject", "slot__term", "slot__monitor")
        .prefetch_related("topics", Prefetch("attendances", queryset=attendees, to_attr=ATTENDEES))
        .order_by("-slot__starts_at", "pk")
    )


# --- Students (RF-082) ------------------------------------------------------------------------


def attended_students(sessions: QuerySet[TutoringSession]) -> QuerySet[User]:
    """Distinct students who attended a session of the scope, each with their attendances.

    The filter precedes the annotations on the same relation, so they count only those rows.
    """
    attended = SessionAttendance.objects.filter(
        attendance=ATTENDED, session__in=sessions.values("pk")
    )
    return (
        User.objects.filter(reservations__attendance__in=attended.values("pk"))
        .annotate(
            session_count=Count("reservations__attendance", distinct=True),
            last_attended_at=Max("reservations__slot__starts_at"),
        )
        .order_by("first_name", "last_name", "pk")
    )


# --- Frequent topics (RF-083, CA-HU09-4, RN-009.2) --------------------------------------------


def frequent_topics(sessions: QuerySet[TutoringSession]) -> QuerySet[Topic]:
    """RF-083 option A: topics of the scope's sessions, most repeated first."""
    return (
        Topic.objects.filter(sessions__in=sessions.values("pk"))
        .select_related("subject")
        .annotate(session_count=Count("sessions", distinct=True), name_key=Lower("name"))
        .order_by(*FREQUENT_TOPICS_ORDERING)
    )
