"""Pure tutoring-session rules (T-05.3, T-05.4, T-05.10, T-05.18, T-05.20, RN-006, RF-052)."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from apps.reservations.domain.rules import ReservationStatus
from apps.tutoring_sessions.domain.rules import (
    MAX_NOTES_LENGTH,
    MAX_TOPIC_NAME_LENGTH,
    AttendanceStatus,
    SessionConflictError,
    SessionRuleError,
    clean_notes,
    clean_topic_name,
    ensure_attendance_complete,
    ensure_duration,
    ensure_editable,
    ensure_has_reservations,
    ensure_started,
    ensure_topics_when_attended,
    reservation_outcome,
)

NOW = datetime(2026, 10, 22, 15, 0, tzinfo=UTC)  # Thursday 10:00 in Bogotá (UTC-5)
HOUR = timedelta(hours=1)
MIN = timedelta(minutes=1)

ATTENDED = AttendanceStatus.ATTENDED
NO_SHOW = AttendanceStatus.NO_SHOW


# --- T-05.4 · the slot already started (RN-006.2) ---------------------------------------------


def test_t_05_4_rn_006_2_future_slot_is_rejected() -> None:
    with pytest.raises(SessionRuleError, match="aún no ha comenzado") as exc:
        ensure_started(NOW + MIN, now=NOW)

    assert exc.value.field == "slot_id"


@pytest.mark.parametrize("starts_at", [NOW, NOW - HOUR])
def test_t_05_4_rn_006_2_started_slot_can_be_recorded(starts_at: datetime) -> None:
    ensure_started(starts_at, now=NOW)


def test_t_05_4_naive_datetimes_are_a_programming_error() -> None:
    with pytest.raises(ValueError, match="zona horaria"):
        ensure_started(NOW.replace(tzinfo=None), now=NOW)


# --- T-05.3 · confirmed reservations only (RN-006.1) ------------------------------------------


def test_t_05_3_rn_006_1_slot_without_confirmed_reservations_is_rejected() -> None:
    with pytest.raises(SessionRuleError, match="no tiene reservas confirmadas") as exc:
        ensure_has_reservations(set())

    assert exc.value.field == "slot_id"


def test_t_05_3_rn_006_1_slot_with_a_confirmed_reservation_is_accepted() -> None:
    ensure_has_reservations({uuid4()})


# --- T-05.18 · every confirmed reservation is marked, and only those (RN-006.5) ---------------


def test_t_05_18_rn_006_5_marking_exactly_the_confirmed_reservations_passes() -> None:
    first, second = uuid4(), uuid4()

    ensure_attendance_complete({first, second}, [second, first])


def test_t_05_18_rn_006_5_a_missing_reservation_is_rejected() -> None:
    first, second = uuid4(), uuid4()

    with pytest.raises(SessionRuleError, match="todas las reservas") as exc:
        ensure_attendance_complete({first, second}, [first])

    assert exc.value.field == "attendance"


def test_t_05_18_rn_006_5_a_foreign_or_cancelled_reservation_is_rejected() -> None:
    first = uuid4()

    with pytest.raises(SessionRuleError, match="no está confirmada en esta franja"):
        ensure_attendance_complete({first}, [first, uuid4()])


def test_t_05_18_rn_006_5_a_reservation_marked_twice_is_rejected() -> None:
    first = uuid4()

    with pytest.raises(SessionRuleError, match="más de una vez"):
        ensure_attendance_complete({first}, [first, first])


# --- T-05.7, T-05.8 · attendance fixes the reservation (RN-006.5) ------------------------------


def test_t_05_8_rn_006_5_attended_completes_the_reservation() -> None:
    assert reservation_outcome(ATTENDED) == ReservationStatus.COMPLETED


def test_t_05_7_ca_hu06_4_no_show_marks_the_reservation_as_no_show() -> None:
    assert reservation_outcome(NO_SHOW) == ReservationStatus.NO_SHOW


# --- T-05.20 · at least one topic when someone attended (RN-006.7) ----------------------------


def test_t_05_20_rn_006_7_attended_session_without_topics_is_rejected() -> None:
    with pytest.raises(SessionRuleError, match="al menos un tema") as exc:
        ensure_topics_when_attended([ATTENDED, NO_SHOW], topic_count=0)

    assert exc.value.field == "topic_ids"


def test_t_05_20_rn_006_7_attended_session_with_a_topic_passes() -> None:
    ensure_topics_when_attended([ATTENDED], topic_count=1)


def test_t_05_20_rn_006_7_session_where_nobody_came_needs_no_topics() -> None:
    ensure_topics_when_attended([NO_SHOW, NO_SHOW], topic_count=0)


# --- Duration and notes ------------------------------------------------------------------------


@pytest.mark.parametrize("minutes", [1, 60, 180])
def test_duration_inside_the_range_passes(minutes: int) -> None:
    ensure_duration(minutes)


@pytest.mark.parametrize("minutes", [0, -5, 181])
def test_duration_outside_the_range_is_rejected(minutes: int) -> None:
    with pytest.raises(SessionRuleError, match="entre 1 y 180 minutos") as exc:
        ensure_duration(minutes)

    assert exc.value.field == "duration_minutes"


def test_notes_are_trimmed_and_blank_becomes_empty() -> None:
    assert clean_notes("  Repasamos derivadas.  ") == "Repasamos derivadas."
    assert clean_notes("   ") == ""
    assert clean_notes(None) == ""


def test_notes_over_the_limit_are_rejected() -> None:
    with pytest.raises(SessionRuleError, match=f"{MAX_NOTES_LENGTH} caracteres") as exc:
        clean_notes("x" * (MAX_NOTES_LENGTH + 1))

    assert exc.value.field == "notes"


# --- T-05.1 · topic names ----------------------------------------------------------------------


def test_t_05_1_topic_name_collapses_inner_and_outer_spaces() -> None:
    assert clean_topic_name("  Regla   de la\tcadena ") == "Regla de la cadena"


@pytest.mark.parametrize("name", ["", "   ", None])
def test_t_05_1_blank_topic_name_is_rejected(name: str | None) -> None:
    with pytest.raises(SessionRuleError, match="Escribe el nombre del tema") as exc:
        clean_topic_name(name)

    assert exc.value.field == "name"


def test_t_05_1_topic_name_over_the_limit_is_rejected() -> None:
    with pytest.raises(SessionRuleError, match=f"{MAX_TOPIC_NAME_LENGTH} caracteres"):
        clean_topic_name("x" * (MAX_TOPIC_NAME_LENGTH + 1))


# --- T-05.10 · edit window (RN-006.6, RF-052) --------------------------------------------------


def test_t_05_10_rn_006_6_session_is_editable_inside_the_window() -> None:
    ensure_editable(NOW - 48 * HOUR + MIN, now=NOW, window_hours=48)


@pytest.mark.parametrize("recorded_at", [NOW - 48 * HOUR, NOW - 72 * HOUR])
def test_t_05_10_rn_006_6_session_is_locked_once_the_window_closes(recorded_at: datetime) -> None:
    with pytest.raises(SessionConflictError, match="48 horas") as exc:
        ensure_editable(recorded_at, now=NOW, window_hours=48)

    assert exc.value.code == "edit_window_closed"
