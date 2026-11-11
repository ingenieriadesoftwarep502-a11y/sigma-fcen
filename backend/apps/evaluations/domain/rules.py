"""Pure evaluation rules, free of Django and HTTP (DDD 4.6, RN-007, RF-060 to RF-063).

Confirmed 2026-11-10 (FASE-06 gate): an integer rating from 1 to 5, an optional comment, and
a monitor's average published only from the 2nd evaluation. The scale is also a database
check, so it lives here; the publication threshold comes from settings, like the other
adjustable rules.
"""

from enum import StrEnum

from apps.tutoring_sessions.domain.rules import AttendanceStatus

SESSION_FIELD = "session_id"
RATING_FIELD = "rating"
COMMENT_FIELD = "comment"

RATING_MIN = 1
RATING_MAX = 5
# Same limit as the student's note on a reservation (RF-047).
MAX_COMMENT_LENGTH = 500

RATING_RANGE_MESSAGE = (
    f"La calificación debe ser un número entero entre {RATING_MIN} y {RATING_MAX}."
)
COMMENT_TOO_LONG_MESSAGE = f"El comentario no puede superar {MAX_COMMENT_LENGTH} caracteres."
NOT_ATTENDED_MESSAGE = "Solo puedes evaluar las monitorías a las que asististe."
NOT_PARTICIPANT_MESSAGE = "Solo los estudiantes que asistieron a esta sesión pueden evaluarla."
ALREADY_EVALUATED_MESSAGE = "Ya evaluaste esta sesión."


class ConflictCode(StrEnum):
    ALREADY_EVALUATED = "already_evaluated"


class EvaluationRuleError(Exception):
    """The request breaks an evaluation rule (400); `field` names the offending input."""

    def __init__(self, field: str, message: str) -> None:
        super().__init__(message)
        self.field = field
        self.message = message


class EvaluationConflictError(Exception):
    """The state forbids the evaluation (409); `code` names it."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class EvaluationForbiddenError(Exception):
    """The user may not evaluate this session (403)."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def ensure_rating(rating: int) -> None:
    """RN-007.4, CA-HU07-4: the rating is inside the confirmed scale."""
    if not RATING_MIN <= rating <= RATING_MAX:
        raise EvaluationRuleError(RATING_FIELD, RATING_RANGE_MESSAGE)


def clean_comment(comment: str | None) -> str:
    """Optional, trimmed, blank becomes empty, at most MAX_COMMENT_LENGTH characters."""
    cleaned = (comment or "").strip()
    if len(cleaned) > MAX_COMMENT_LENGTH:
        raise EvaluationRuleError(COMMENT_FIELD, COMMENT_TOO_LONG_MESSAGE)
    return cleaned


def ensure_attended(attendance: AttendanceStatus) -> None:
    """RN-007.1, RN-007.3, CA-HU07-5: only a session the student attended (COMPLETED)."""
    if attendance != AttendanceStatus.ATTENDED:
        raise EvaluationRuleError(SESSION_FIELD, NOT_ATTENDED_MESSAGE)


def published_average(average: float | None, count: int, *, minimum: int) -> float | None:
    """RN-007.5: below `minimum` evaluations there is not enough data, so no average."""
    if average is None or count < minimum:
        return None
    return average
