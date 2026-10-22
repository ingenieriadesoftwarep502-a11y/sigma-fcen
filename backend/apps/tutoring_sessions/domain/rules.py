"""Pure tutoring-session rules, free of Django and HTTP (DDD 4.5, RN-006, RF-052).

One session per slot records what happened for every CONFIRMED reservation of it (FASE-05
§4, confirmed 2026-10-22). The edit window comes from settings, so it can change without
touching the rules; the maximum duration is also a database check, so it lives here.
"""

from collections import Counter
from collections.abc import Iterable
from datetime import datetime, timedelta
from enum import StrEnum
from uuid import UUID

from apps.reservations.domain.rules import ReservationStatus

SLOT_FIELD = "slot_id"
ATTENDANCE_FIELD = "attendance"
TOPICS_FIELD = "topic_ids"
DURATION_FIELD = "duration_minutes"
NOTES_FIELD = "notes"
NAME_FIELD = "name"

MAX_NOTES_LENGTH = 2000
MAX_TOPIC_NAME_LENGTH = 80
MAX_DURATION_MINUTES = 180

NOT_STARTED_MESSAGE = "La monitoría aún no ha comenzado; regístrala cuando empiece."
NO_RESERVATIONS_MESSAGE = "La franja no tiene reservas confirmadas que registrar."
MISSING_MESSAGE = "Marca la asistencia de todas las reservas confirmadas de la franja."
UNKNOWN_MESSAGE = "Una de las reservas no está confirmada en esta franja."
REPEATED_MESSAGE = "Una reserva aparece más de una vez."
TOPIC_REQUIRED_MESSAGE = "Si alguien asistió, indica al menos un tema trabajado."
TOPIC_NAME_REQUIRED_MESSAGE = "Escribe el nombre del tema."
NAIVE_DATETIME_MESSAGE = "Las fechas de una sesión deben llevar zona horaria."
NOTES_TOO_LONG_MESSAGE = f"Las observaciones no pueden superar {MAX_NOTES_LENGTH} caracteres."
TOPIC_NAME_TOO_LONG_MESSAGE = f"El tema no puede superar {MAX_TOPIC_NAME_LENGTH} caracteres."


DURATION_MESSAGE = f"La duración debe estar entre 1 y {MAX_DURATION_MINUTES} minutos."


def edit_window_message(hours: int) -> str:
    return f"La sesión solo se puede editar durante las {hours} horas siguientes a su registro."


class AttendanceStatus(StrEnum):
    """Whether the student of a reservation came to the session (DDD 4.5)."""

    ATTENDED = "ATTENDED"
    NO_SHOW = "NO_SHOW"


class SessionRuleError(Exception):
    """The request breaks a session rule (400); `field` names the offending input."""

    def __init__(self, field: str, message: str) -> None:
        super().__init__(message)
        self.field = field
        self.message = message


class SessionConflictError(Exception):
    """The state of the slot or the session forbids the change (409); `code` names it."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class SessionForbiddenError(Exception):
    """The user may not act on this slot, session or subject (403)."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def _ensure_aware(*moments: datetime) -> None:
    if any(moment.tzinfo is None for moment in moments):
        raise ValueError(NAIVE_DATETIME_MESSAGE)


def ensure_started(starts_at: datetime, *, now: datetime) -> None:
    """RN-006.2: a session is recorded only once its slot has started."""
    _ensure_aware(starts_at, now)
    if starts_at > now:
        raise SessionRuleError(SLOT_FIELD, NOT_STARTED_MESSAGE)


def ensure_has_reservations(confirmed: set[UUID]) -> None:
    """RN-006.1: there must be someone to record; cancelled reservations do not count."""
    if not confirmed:
        raise SessionRuleError(SLOT_FIELD, NO_RESERVATIONS_MESSAGE)


def ensure_attendance_complete(confirmed: set[UUID], marked: Iterable[UUID]) -> None:
    """RN-006.5: every CONFIRMED reservation of the slot is marked once, and nothing else."""
    counts = Counter(marked)
    if any(times > 1 for times in counts.values()):
        raise SessionRuleError(ATTENDANCE_FIELD, REPEATED_MESSAGE)
    if counts.keys() - confirmed:
        raise SessionRuleError(ATTENDANCE_FIELD, UNKNOWN_MESSAGE)
    if confirmed - counts.keys():
        raise SessionRuleError(ATTENDANCE_FIELD, MISSING_MESSAGE)


def reservation_outcome(attendance: AttendanceStatus) -> ReservationStatus:
    """RN-006.5: attending completes the reservation; missing it is a no-show."""
    if attendance == AttendanceStatus.ATTENDED:
        return ReservationStatus.COMPLETED
    return ReservationStatus.NO_SHOW


def ensure_topics_when_attended(
    attendances: Iterable[AttendanceStatus], *, topic_count: int
) -> None:
    """RN-006.7: a session someone attended names at least one topic (feeds RF-083)."""
    if topic_count == 0 and AttendanceStatus.ATTENDED in attendances:
        raise SessionRuleError(TOPICS_FIELD, TOPIC_REQUIRED_MESSAGE)


def ensure_duration(minutes: int) -> None:
    if not 1 <= minutes <= MAX_DURATION_MINUTES:
        raise SessionRuleError(DURATION_FIELD, DURATION_MESSAGE)


def clean_notes(notes: str | None) -> str:
    """Optional, trimmed, blank becomes empty, at most MAX_NOTES_LENGTH characters."""
    cleaned = (notes or "").strip()
    if len(cleaned) > MAX_NOTES_LENGTH:
        raise SessionRuleError(NOTES_FIELD, NOTES_TOO_LONG_MESSAGE)
    return cleaned


def clean_topic_name(name: str | None) -> str:
    """Single spaces only, so "Regla  de la cadena" and "regla de la cadena" are one topic."""
    cleaned = " ".join((name or "").split())
    if not cleaned:
        raise SessionRuleError(NAME_FIELD, TOPIC_NAME_REQUIRED_MESSAGE)
    if len(cleaned) > MAX_TOPIC_NAME_LENGTH:
        raise SessionRuleError(NAME_FIELD, TOPIC_NAME_TOO_LONG_MESSAGE)
    return cleaned


def ensure_editable(recorded_at: datetime, *, now: datetime, window_hours: int) -> None:
    """RN-006.6, RF-052: the session can be corrected for `window_hours` after recording."""
    _ensure_aware(recorded_at, now)
    if now - recorded_at >= timedelta(hours=window_hours):
        raise SessionConflictError("edit_window_closed", edit_window_message(window_hours))
