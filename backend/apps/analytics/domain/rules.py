"""Pure rules of the teacher's follow-up, free of Django and HTTP (FASE-08, RN-009).

A session belongs to a course when its slot has the course's subject and term; slots are not
tied to a group, so every group of a subject in a term shares its sessions. That is the same
rule FASE-05 uses to let the course's teacher read a session.

RF-083, confirmed 2026-11-10 (option A): the frequent difficulties are the `Topic`s most
repeated across those sessions, counted in the database, most frequent first.
"""

from datetime import date, datetime, time, timedelta

from apps.availability.domain.rules import LOCAL_TZ

DATE_TO_FIELD = "date_to"

FOREIGN_COURSE_MESSAGE = "Solo puedes consultar tus propios cursos."
INVERTED_RANGE_MESSAGE = "La fecha final no puede ser anterior a la inicial."

# RN-009.2: most repeated first; equal counts by case-insensitive name, then id, so a page
# never reorders between requests.
FREQUENT_TOPICS_ORDERING = ("-session_count", "name_key", "id")


class TeachingRuleError(Exception):
    """The request breaks a follow-up rule (400); `field` names the offending input."""

    def __init__(self, field: str, message: str) -> None:
        super().__init__(message)
        self.field = field
        self.message = message


class TeachingForbiddenError(Exception):
    """The course is not the teacher's (403)."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def ensure_own_course(*, owned: bool) -> None:
    """RN-009.1, CA-HU09-3: a teacher reads only the courses they are assigned to.

    An unknown course answers the same, so the response never reveals whether an id exists.
    """
    if not owned:
        raise TeachingForbiddenError(FOREIGN_COURSE_MESSAGE)


def local_day_bounds(
    date_from: date | None, date_to: date | None
) -> tuple[datetime | None, datetime | None]:
    """Whole days in Bogotá (RNF-DAT-001) as [start, end): `date_to` is included."""
    if date_from is not None and date_to is not None and date_to < date_from:
        raise TeachingRuleError(DATE_TO_FIELD, INVERTED_RANGE_MESSAGE)
    start = datetime.combine(date_from, time(0, 0), tzinfo=LOCAL_TZ) if date_from else None
    end = (
        datetime.combine(date_to + timedelta(days=1), time(0, 0), tzinfo=LOCAL_TZ)
        if date_to
        else None
    )
    return start, end
