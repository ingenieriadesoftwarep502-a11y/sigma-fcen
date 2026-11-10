"""Pure reservation and cancellation rules, free of Django and HTTP (DDD 4.4, RN-004, RN-005).

The numbers come from ADR-010 (minimum advance, active limit) and ADR-011 (cancellation
window); callers pass them in from settings so each one can change without touching the rules.
"""

from collections.abc import Iterable
from datetime import datetime, time, timedelta
from enum import StrEnum
from zoneinfo import ZoneInfo

LOCAL_TZ = ZoneInfo("America/Bogota")

SLOT_FIELD = "slot_id"
REASON_FIELD = "reason"
NOTE_FIELD = "note"

# RF-047: an optional note the student leaves for the monitor when booking.
MAX_NOTE_LENGTH = 500

PAST_SLOT_MESSAGE = "La franja ya comenzó o pasó; no se puede reservar."
OWN_OVERLAP_MESSAGE = "En ese horario ya tienes una reserva confirmada."
SLOT_FULL_MESSAGE = "La franja ya no tiene cupos."
STARTED_MESSAGE = "La monitoría ya comenzó; su asistencia se registra con la sesión."
REASON_REQUIRED_MESSAGE = "Escribe la justificación de la cancelación."
NAIVE_DATETIME_MESSAGE = "Las fechas de una reserva deben llevar zona horaria."
NOTE_TOO_LONG_MESSAGE = f"La nota no puede superar {MAX_NOTE_LENGTH} caracteres."


def advance_message(hours: int) -> str:
    return f"Debes reservar con al menos {hours} horas de anticipación."


def active_limit_message(limit: int) -> str:
    noun = "reserva activa" if limit == 1 else "reservas activas"
    return f"Puedes tener como máximo {limit} {noun} por asignatura y semana."


class ReservationStatus(StrEnum):
    """Life cycle of a reservation (DDD section 6.2)."""

    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"
    COMPLETED = "COMPLETED"
    NO_SHOW = "NO_SHOW"


# Cancel in time, or late (ADR-011: recorded as a no-show). COMPLETED is reachable only by
# recording the session (SESSION_OUTCOMES), never through these transitions.
ALLOWED_TRANSITIONS = frozenset(
    {
        (ReservationStatus.CONFIRMED, ReservationStatus.CANCELLED),
        (ReservationStatus.CONFIRMED, ReservationStatus.NO_SHOW),
    }
)


# RN-006.5: the session record closes each CONFIRMED reservation of its slot.
SESSION_OUTCOMES = frozenset({ReservationStatus.COMPLETED, ReservationStatus.NO_SHOW})


class ReservationRuleError(Exception):
    """The request breaks a reservation rule (400); `field` names the offending input."""

    def __init__(self, field: str, message: str) -> None:
        super().__init__(message)
        self.field = field
        self.message = message


class ReservationConflictError(Exception):
    """The state of the slot or the reservation forbids the change (409); `code` names it."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class ReservationForbiddenError(Exception):
    """The user may not act on this reservation or slot (403)."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def _ensure_aware(*moments: datetime) -> None:
    if any(moment.tzinfo is None for moment in moments):
        raise ValueError(NAIVE_DATETIME_MESSAGE)


def ensure_bookable(starts_at: datetime, *, now: datetime, min_advance_hours: int) -> None:
    """RN-004.2 and RN-004.6: only future slots, booked at least `min_advance_hours` ahead."""
    _ensure_aware(starts_at, now)
    if starts_at <= now:
        raise ReservationRuleError(SLOT_FIELD, PAST_SLOT_MESSAGE)
    if starts_at - now < timedelta(hours=min_advance_hours):
        raise ReservationRuleError(SLOT_FIELD, advance_message(min_advance_hours))


def ensure_no_own_overlap(
    starts_at: datetime, ends_at: datetime, taken: Iterable[tuple[datetime, datetime]]
) -> None:
    """RN-004.4: half-open intervals, like the slots themselves (RN-003.3)."""
    if any(starts_at < end and begin < ends_at for begin, end in taken):
        raise ReservationRuleError(SLOT_FIELD, OWN_OVERLAP_MESSAGE)


def ensure_has_seat(*, confirmed: int, capacity: int) -> None:
    """RN-004.1 and RN-004.3: CONFIRMED reservations never exceed the slot's capacity."""
    if confirmed >= capacity:
        raise ReservationConflictError("slot_full", SLOT_FULL_MESSAGE)


def ensure_below_active_limit(*, active: int, limit: int) -> None:
    """RN-004.7: at most `limit` active reservations per student, subject and week."""
    if active >= limit:
        raise ReservationRuleError(SLOT_FIELD, active_limit_message(limit))


def week_bounds(moment: datetime) -> tuple[datetime, datetime]:
    """The Bogotá calendar week (Monday 00:00 to the next Monday) that contains `moment`."""
    _ensure_aware(moment)
    day = moment.astimezone(LOCAL_TZ).date()
    monday = datetime.combine(day - timedelta(days=day.weekday()), time.min, tzinfo=LOCAL_TZ)
    return monday, monday + timedelta(days=7)


def ensure_transition(current: ReservationStatus, target: ReservationStatus) -> None:
    """States change only through the explicit transitions of DDD section 6.2."""
    if (current, target) not in ALLOWED_TRANSITIONS:
        raise ReservationConflictError(
            "invalid_transition", f"No se puede pasar una reserva de {current} a {target}."
        )


def ensure_session_outcome(current: ReservationStatus, target: ReservationStatus) -> None:
    """DDD section 6.2: only the session record moves CONFIRMED to COMPLETED or NO_SHOW."""
    if current != ReservationStatus.CONFIRMED or target not in SESSION_OUTCOMES:
        raise ReservationConflictError(
            "invalid_transition", f"No se puede pasar una reserva de {current} a {target}."
        )


def student_cancellation_status(
    starts_at: datetime, *, now: datetime, window_hours: int
) -> ReservationStatus:
    """ADR-011: in time it is a cancellation; later it is recorded as a no-show.

    Either way the seat is freed. Once the session started, its outcome belongs to the
    session record (FASE-05), so cancelling is no longer possible.
    """
    _ensure_aware(starts_at, now)
    if starts_at <= now:
        raise ReservationRuleError(SLOT_FIELD, STARTED_MESSAGE)
    if starts_at - now >= timedelta(hours=window_hours):
        return ReservationStatus.CANCELLED
    return ReservationStatus.NO_SHOW


def ensure_reason(reason: str | None) -> str:
    """RN-005.5: a cancellation by someone other than the student carries a justification."""
    cleaned = (reason or "").strip()
    if not cleaned:
        raise ReservationRuleError(REASON_FIELD, REASON_REQUIRED_MESSAGE)
    return cleaned


def clean_note(note: str | None) -> str:
    """RF-047: optional, trimmed, blank becomes empty, at most MAX_NOTE_LENGTH characters."""
    cleaned = (note or "").strip()
    if len(cleaned) > MAX_NOTE_LENGTH:
        raise ReservationRuleError(NOTE_FIELD, NOTE_TOO_LONG_MESSAGE)
    return cleaned
