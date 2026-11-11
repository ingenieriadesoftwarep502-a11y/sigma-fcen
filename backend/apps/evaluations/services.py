"""Evaluation use case: a student rates a session they attended (HU-07, RN-007, RF-060, RF-061).

Uniqueness per session and student is a database constraint; the lookup before the insert
only gives the common case a clear message, and a concurrent duplicate still ends as 409.

The domain event `EvaluationSubmitted` (DDD §7) is a documented extension point; the average
is computed on read with an aggregate, so nothing has to be recalculated here.
"""

from django.db import IntegrityError, transaction

from apps.accounts.models import Role, User
from apps.evaluations.domain.rules import (
    ALREADY_EVALUATED_MESSAGE,
    NOT_PARTICIPANT_MESSAGE,
    ConflictCode,
    EvaluationConflictError,
    EvaluationForbiddenError,
    clean_comment,
    ensure_attended,
    ensure_rating,
)
from apps.evaluations.models import UNIQUE_SESSION_STUDENT, Evaluation
from apps.tutoring_sessions.domain.rules import AttendanceStatus
from apps.tutoring_sessions.models import SessionAttendance, TutoringSession


def _already_evaluated() -> EvaluationConflictError:
    return EvaluationConflictError(ConflictCode.ALREADY_EVALUATED.value, ALREADY_EVALUATED_MESSAGE)


def _attendance_of(student: User, session: TutoringSession) -> SessionAttendance:
    """CA-HU07-3: only a student marked in the session; RN-002: and still a student."""
    attendance = SessionAttendance.objects.filter(
        session=session, reservation__student=student
    ).first()
    if attendance is None or not student.has_role(Role.Code.STUDENT):
        raise EvaluationForbiddenError(NOT_PARTICIPANT_MESSAGE)
    return attendance


def _evaluated(session: TutoringSession, student: User) -> bool:
    return Evaluation.objects.filter(session=session, student=student).exists()


def submit_evaluation(
    *, student: User, session: TutoringSession, rating: int, comment: str | None
) -> Evaluation:
    """Records the student's rating of a session they attended (T-06.3 to T-06.6)."""
    attendance = _attendance_of(student, session)
    ensure_attended(AttendanceStatus(attendance.attendance))
    ensure_rating(rating)
    cleaned = clean_comment(comment)
    if _evaluated(session, student):
        raise _already_evaluated()
    try:
        with transaction.atomic():
            return Evaluation.objects.create(
                session=session, student=student, rating=rating, comment=cleaned
            )
    except IntegrityError as error:
        diag = getattr(error.__cause__, "diag", None)
        if getattr(diag, "constraint_name", None) != UNIQUE_SESSION_STUDENT:
            raise
        raise _already_evaluated() from error
