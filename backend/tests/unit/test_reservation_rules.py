"""Pure reservation and cancellation rules (T-04.1, T-04.2, RN-004, RN-005, ADR-010, ADR-011)."""

from datetime import UTC, datetime, timedelta

import pytest

from apps.reservations.domain.rules import (
    ReservationConflictError,
    ReservationRuleError,
    ReservationStatus,
    clean_note,
    ensure_below_active_limit,
    ensure_bookable,
    ensure_has_seat,
    ensure_no_own_overlap,
    ensure_reason,
    ensure_transition,
    student_cancellation_status,
    week_bounds,
)

NOW = datetime(2026, 10, 19, 15, 0, tzinfo=UTC)  # Monday 10:00 in Bogotá (UTC-5)
HOUR = timedelta(hours=1)
MIN = timedelta(minutes=1)


def bookable(starts_at: datetime) -> None:
    ensure_bookable(starts_at, now=NOW, min_advance_hours=2)


# --- T-04.1 · future slot and minimum advance (RN-004.2, RN-004.6) ----------------------------


@pytest.mark.parametrize("starts_at", [NOW - HOUR, NOW])
def test_t_04_1_rn_004_2_past_or_started_slot_is_rejected(starts_at: datetime) -> None:
    with pytest.raises(ReservationRuleError, match="ya comenzó o pasó") as exc:
        bookable(starts_at)

    assert exc.value.field == "slot_id"


def test_t_04_1_rn_004_6_slot_inside_the_minimum_advance_is_rejected() -> None:
    with pytest.raises(ReservationRuleError, match="2 horas de anticipación"):
        bookable(NOW + 2 * HOUR - MIN)


def test_t_04_1_rn_004_6_slot_exactly_at_the_minimum_advance_is_bookable() -> None:
    bookable(NOW + 2 * HOUR)


def test_t_04_1_naive_datetimes_are_a_programming_error() -> None:
    with pytest.raises(ValueError, match="zona horaria"):
        ensure_bookable(datetime(2026, 10, 20, 10), now=NOW, min_advance_hours=2)


# --- T-04.1 · own overlap (RN-004.4) ----------------------------------------------------------


@pytest.mark.parametrize(
    ("offset", "clashes"),
    [(0, True), (30, True), (-30, True), (60, False), (-60, False)],
)
def test_t_04_1_rn_004_4_own_overlap(offset: int, clashes: bool) -> None:
    start = NOW + 5 * HOUR
    other = start + timedelta(minutes=offset)
    taken = [(other, other + HOUR)]

    if clashes:
        with pytest.raises(ReservationRuleError, match="ya tienes una reserva"):
            ensure_no_own_overlap(start, start + HOUR, taken)
    else:
        ensure_no_own_overlap(start, start + HOUR, taken)


def test_t_04_1_without_other_reservations_there_is_no_overlap() -> None:
    ensure_no_own_overlap(NOW, NOW + HOUR, [])


# --- T-04.1 · seats (RN-004.1, RN-004.3) and active limit (RN-004.7) ---------------------------


def test_t_04_1_rn_004_3_full_slot_is_a_conflict() -> None:
    ensure_has_seat(confirmed=1, capacity=2)

    with pytest.raises(ReservationConflictError) as exc:
        ensure_has_seat(confirmed=2, capacity=2)

    assert exc.value.code == "slot_full"


def test_t_04_9_rn_004_7_active_limit_per_subject_and_week() -> None:
    ensure_below_active_limit(active=0, limit=1)

    with pytest.raises(ReservationRuleError, match="1 reserva activa por asignatura y semana"):
        ensure_below_active_limit(active=1, limit=1)


def test_t_04_9_week_runs_monday_to_monday_in_bogota() -> None:
    # Sunday 23:30 in Bogotá is Monday 04:30 UTC: it still belongs to the previous week.
    sunday_night = datetime(2026, 10, 26, 4, 30, tzinfo=UTC)

    start, end = week_bounds(sunday_night)

    assert start == datetime(2026, 10, 19, 5, 0, tzinfo=UTC)
    assert end - start == timedelta(days=7)


# --- T-04.2 · state machine (DDD §6.2) ----------------------------------------------------------


@pytest.mark.parametrize("target", [ReservationStatus.CANCELLED, ReservationStatus.NO_SHOW])
def test_t_04_2_confirmed_reservation_can_end(target: ReservationStatus) -> None:
    ensure_transition(ReservationStatus.CONFIRMED, target)


@pytest.mark.parametrize(
    ("current", "target"),
    [
        (ReservationStatus.CANCELLED, ReservationStatus.CONFIRMED),
        (ReservationStatus.CANCELLED, ReservationStatus.CANCELLED),
        (ReservationStatus.COMPLETED, ReservationStatus.CANCELLED),
        (ReservationStatus.NO_SHOW, ReservationStatus.COMPLETED),
        (ReservationStatus.NO_SHOW, ReservationStatus.CANCELLED),
        # COMPLETED only comes from recording the session (FASE-05), never a direct edit.
        (ReservationStatus.CONFIRMED, ReservationStatus.COMPLETED),
    ],
)
def test_t_04_2_forbidden_transitions_are_rejected(
    current: ReservationStatus, target: ReservationStatus
) -> None:
    with pytest.raises(ReservationConflictError) as exc:
        ensure_transition(current, target)

    assert exc.value.code == "invalid_transition"


# --- ADR-011 · cancellation window ----------------------------------------------------------


def cancel_status(starts_at: datetime) -> ReservationStatus:
    return student_cancellation_status(starts_at, now=NOW, window_hours=4)


@pytest.mark.parametrize("ahead", [4 * HOUR, 4 * HOUR + MIN, 48 * HOUR])
def test_t_04_12_adr_011_cancelling_inside_the_window_cancels(ahead: timedelta) -> None:
    assert cancel_status(NOW + ahead) == ReservationStatus.CANCELLED


@pytest.mark.parametrize("ahead", [4 * HOUR - MIN, HOUR, MIN])
def test_t_04_13_adr_011_late_cancellation_is_a_no_show(ahead: timedelta) -> None:
    assert cancel_status(NOW + ahead) == ReservationStatus.NO_SHOW


@pytest.mark.parametrize("starts_at", [NOW, NOW - HOUR])
def test_t_04_13_a_started_session_can_no_longer_be_cancelled(starts_at: datetime) -> None:
    with pytest.raises(ReservationRuleError, match="ya comenzó"):
        cancel_status(starts_at)


@pytest.mark.parametrize("reason", ["", "   ", None])
def test_t_04_16_rn_005_5_reason_is_required(reason: str | None) -> None:
    with pytest.raises(ReservationRuleError, match="justificación") as exc:
        ensure_reason(reason)

    assert exc.value.field == "reason"


def test_t_04_16_reason_is_returned_trimmed() -> None:
    assert ensure_reason("  Me enfermé  ") == "Me enfermé"


# --- RF-047 · optional student note --------------------------------------------------------


@pytest.mark.parametrize(
    ("note", "expected"), [(None, ""), ("", ""), ("  ", ""), (" Hola ", "Hola")]
)
def test_rf_047_note_is_trimmed_and_blank_is_empty(note: str | None, expected: str) -> None:
    assert clean_note(note) == expected


def test_rf_047_note_has_a_500_character_limit() -> None:
    assert clean_note("x" * 500) == "x" * 500

    with pytest.raises(ReservationRuleError, match="500 caracteres") as exc:
        clean_note("x" * 501)

    assert exc.value.field == "note"
