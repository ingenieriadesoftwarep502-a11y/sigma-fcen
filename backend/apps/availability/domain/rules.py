"""Pure availability rules, free of Django and HTTP (DDD section 4.3, RN-003, ADR-010)."""

from datetime import datetime, timedelta
from enum import StrEnum
from zoneinfo import ZoneInfo

LOCAL_TZ = ZoneInfo("America/Bogota")

END_BEFORE_START_MESSAGE = "La hora de fin debe ser posterior a la de inicio."
PAST_START_MESSAGE = "La franja no puede empezar en el pasado."
START_STEP_MESSAGE = "La franja debe empezar en punto o a la media."
NAIVE_DATETIME_MESSAGE = "Las fechas de una franja deben llevar zona horaria."


def duration_message(minutes: int) -> str:
    return f"La franja debe durar {minutes} minutos."


class SlotStatus(StrEnum):
    """Life cycle of a slot (DDD section 6.1)."""

    AVAILABLE = "AVAILABLE"
    RESERVED = "RESERVED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


# Reserve, withdraw, cancel the reservation, and the hour passing without a session.
ALLOWED_TRANSITIONS = frozenset(
    {
        (SlotStatus.AVAILABLE, SlotStatus.RESERVED),
        (SlotStatus.AVAILABLE, SlotStatus.CANCELLED),
        (SlotStatus.RESERVED, SlotStatus.AVAILABLE),
        (SlotStatus.RESERVED, SlotStatus.EXPIRED),
    }
)


class SlotRuleError(Exception):
    """An availability rule rejected the slot; `field` names the offending input."""

    def __init__(self, field: str, message: str) -> None:
        super().__init__(message)
        self.field = field
        self.message = message


def overlaps(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    """RN-003.3: half-open intervals [start, end); touching borders do not overlap."""
    return a_start < b_end and b_start < a_end


def ensure_valid_window(
    starts_at: datetime,
    ends_at: datetime,
    *,
    now: datetime,
    duration_minutes: int,
    start_step_minutes: int,
) -> None:
    """RN-003.1, RN-003.2 and RN-003.6: a future block of fixed length on an allowed start."""
    if starts_at.tzinfo is None or ends_at.tzinfo is None:
        raise ValueError(NAIVE_DATETIME_MESSAGE)
    if ends_at <= starts_at:
        raise SlotRuleError("ends_at", END_BEFORE_START_MESSAGE)
    if ends_at - starts_at != timedelta(minutes=duration_minutes):
        raise SlotRuleError("ends_at", duration_message(duration_minutes))
    local = starts_at.astimezone(LOCAL_TZ)
    if local.second or local.microsecond or local.minute % start_step_minutes:
        raise SlotRuleError("starts_at", START_STEP_MESSAGE)
    if starts_at <= now:
        raise SlotRuleError("starts_at", PAST_START_MESSAGE)


def ensure_transition(current: SlotStatus, target: SlotStatus) -> None:
    """States change only through the explicit transitions of DDD section 6.1."""
    if (current, target) not in ALLOWED_TRANSITIONS:
        raise SlotRuleError("status", f"No se puede pasar una franja de {current} a {target}.")
