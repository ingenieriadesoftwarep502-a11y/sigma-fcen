"""Pure availability rules: overlap, window and block shape (RN-003, ADR-010, FASE-03 §5)."""

from datetime import UTC, datetime, timedelta

import pytest

from apps.availability.domain.rules import (
    SlotRuleError,
    SlotStatus,
    ensure_transition,
    ensure_valid_window,
    overlaps,
)

BASE = datetime(2026, 10, 20, 15, 0, tzinfo=UTC)  # 10:00 in Bogotá (UTC-5)
NOW = datetime(2026, 10, 11, 12, 0, tzinfo=UTC)
HOUR = timedelta(hours=1)
MIN = timedelta(minutes=1)


def at(minutes: int) -> datetime:
    return BASE + timedelta(minutes=minutes)


# Existing slot: [0, 60). Cases (a) to (h) from FASE-03 §5, borders first.
@pytest.mark.parametrize(
    ("case", "start", "end", "expected"),
    [
        ("c) borde exacto antes", -60, 0, False),
        ("c) borde exacto después", 60, 120, False),
        ("d) inicio dentro", 30, 90, True),
        ("e) fin dentro", -30, 30, True),
        ("a) antes, sin tocar", -120, -60, False),
        ("b) después, sin tocar", 90, 150, False),
        ("f) contenida", 15, 45, True),
        ("g) contenedora", -30, 90, True),
        ("h) idéntica", 0, 60, True),
    ],
)
def test_t_03_1_rn_003_3_overlap_cases(case: str, start: int, end: int, expected: bool) -> None:
    assert overlaps(at(0), at(60), at(start), at(end)) is expected, case


@pytest.mark.parametrize(("start", "end"), [(-60, 0), (30, 90), (15, 45)])
def test_t_03_1_overlap_is_symmetric(start: int, end: int) -> None:
    assert overlaps(at(0), at(60), at(start), at(end)) is overlaps(
        at(start), at(end), at(0), at(60)
    )


def window(starts_at: datetime, ends_at: datetime | None = None, now: datetime = NOW) -> None:
    ensure_valid_window(
        starts_at,
        starts_at + HOUR if ends_at is None else ends_at,
        now=now,
        duration_minutes=60,
        start_step_minutes=30,
    )


def test_t_03_valid_block_on_the_hour_and_half_hour_is_accepted() -> None:
    window(BASE)
    window(BASE + timedelta(minutes=30))


@pytest.mark.parametrize("ends_at", [BASE, BASE - HOUR])
def test_t_03_3_rn_003_1_end_not_after_start_is_rejected(ends_at: datetime) -> None:
    with pytest.raises(SlotRuleError, match="La hora de fin debe ser posterior") as exc:
        window(BASE, ends_at)
    assert exc.value.field == "ends_at"


@pytest.mark.parametrize("starts_at", [NOW - HOUR, NOW])
def test_t_03_2_rn_003_2_slot_in_the_past_is_rejected(starts_at: datetime) -> None:
    with pytest.raises(SlotRuleError, match="no puede empezar en el pasado") as exc:
        window(starts_at)
    assert exc.value.field == "starts_at"


@pytest.mark.parametrize("length", [HOUR - MIN, HOUR + 30 * MIN, 2 * HOUR])
def test_rn_003_6_block_must_last_exactly_the_configured_duration(length: timedelta) -> None:
    with pytest.raises(SlotRuleError, match="debe durar 60 minutos") as exc:
        window(BASE, BASE + length)
    assert exc.value.field == "ends_at"


@pytest.mark.parametrize(
    "starts_at",
    [BASE + 15 * MIN, BASE + MIN, BASE + timedelta(seconds=1), BASE + timedelta(microseconds=1)],
)
def test_rn_003_6_start_must_fall_on_the_hour_or_half_hour(starts_at: datetime) -> None:
    with pytest.raises(SlotRuleError, match="en punto o a la media") as exc:
        window(starts_at)
    assert exc.value.field == "starts_at"


def test_rnf_dat_001_naive_datetime_is_a_programming_error() -> None:
    # Never silently read a naive datetime as UTC or as Bogotá time.
    with pytest.raises(ValueError, match="zona horaria"):
        window(BASE.replace(tzinfo=None))


# --- T-03.4 State machine (DDD section 6.1) ---------------------------------------------------

ALLOWED = {
    (SlotStatus.AVAILABLE, SlotStatus.RESERVED),
    (SlotStatus.AVAILABLE, SlotStatus.CANCELLED),
    (SlotStatus.RESERVED, SlotStatus.AVAILABLE),
    (SlotStatus.RESERVED, SlotStatus.EXPIRED),
}


@pytest.mark.parametrize(("current", "target"), sorted(ALLOWED))
def test_t_03_4_allowed_transitions(current: SlotStatus, target: SlotStatus) -> None:
    ensure_transition(current, target)


@pytest.mark.parametrize(
    ("current", "target"),
    sorted({(a, b) for a in SlotStatus for b in SlotStatus} - ALLOWED),
)
def test_t_03_4_forbidden_transitions_are_rejected(current: SlotStatus, target: SlotStatus) -> None:
    with pytest.raises(SlotRuleError, match="No se puede pasar") as exc:
        ensure_transition(current, target)
    assert exc.value.field == "status"
