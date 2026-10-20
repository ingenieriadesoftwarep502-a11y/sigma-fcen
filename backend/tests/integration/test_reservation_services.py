"""Reservation and cancellation use cases (T-04.4 to T-04.16, T-04.22, T-04.23).

CA-HU03-1 to CA-HU03-6, CA-HU04-1 to CA-HU04-4, RN-004, RN-005, ADR-010, ADR-011.
"""

from datetime import datetime, timedelta
from typing import Any
from unittest import mock

import pytest
from django.test import override_settings
from django.utils import timezone

from apps.accounts.models import Role, User
from apps.availability.domain.rules import SlotStatus
from apps.availability.models import AvailabilitySlot
from apps.reservations.domain.rules import (
    ReservationConflictError,
    ReservationForbiddenError,
    ReservationRuleError,
    ReservationStatus,
)
from apps.reservations.models import Reservation
from apps.reservations.services import cancel_reservation, reserve_slot
from tests.availability_data import HOUR, SLOT_START, Owner, make_assigned_monitor, make_slot
from tests.catalog_data import make_subject, make_user
from tests.reservation_data import make_reservation, make_student

pytestmark = pytest.mark.django_db


def soon(hours: float) -> datetime:
    """A start `hours` from now, for the windows that depend on the current time."""
    return timezone.now() + timedelta(hours=hours)


@pytest.fixture
def owner() -> Owner:
    return make_assigned_monitor()


def slot_of(owner: Owner, **extra: Any) -> AvailabilitySlot:
    return make_slot(*owner, **extra)


def refreshed(slot: AvailabilitySlot) -> AvailabilitySlot:
    slot.refresh_from_db()
    return slot


# --- T-04.4 · valid reservation (CA-HU03-1, RN-004.5) -----------------------------------------


def test_t_04_4_ca_hu03_1_reservation_is_confirmed_and_fills_the_slot(owner: Owner) -> None:
    slot = slot_of(owner)
    student = make_student()

    reservation = reserve_slot(student=student, slot=slot)

    assert reservation.status == ReservationStatus.CONFIRMED
    assert reservation.student == student
    assert reservation.slot == slot
    assert refreshed(slot).status == SlotStatus.RESERVED


# --- T-04.22 · seats (ADR-010 R1) ------------------------------------------------------------


def test_t_04_22_group_slot_fills_on_its_last_seat_and_frees_on_cancel(owner: Owner) -> None:
    slot = slot_of(owner, capacity=3)
    ana, luis, eva = (make_student(f"{name}@unal.edu.co") for name in ("ana", "luis", "eva"))

    reserve_slot(student=ana, slot=slot)
    assert refreshed(slot).status == SlotStatus.AVAILABLE
    reserve_slot(student=luis, slot=slot)
    assert refreshed(slot).status == SlotStatus.AVAILABLE
    last = reserve_slot(student=eva, slot=slot)
    assert refreshed(slot).status == SlotStatus.RESERVED

    cancel_reservation(reservation=last, actor=eva)

    assert refreshed(slot).status == SlotStatus.AVAILABLE
    assert slot.reservations.filter(status=ReservationStatus.CONFIRMED).count() == 2


# --- T-04.5 · full slot (CA-HU03-2) ----------------------------------------------------------


def test_t_04_5_ca_hu03_2_reserved_slot_is_a_conflict_and_creates_nothing(owner: Owner) -> None:
    slot = slot_of(owner)
    reserve_slot(student=make_student("ana@unal.edu.co"), slot=slot)

    with pytest.raises(ReservationConflictError) as exc:
        reserve_slot(student=make_student("luis@unal.edu.co"), slot=slot)

    assert exc.value.code == "slot_unavailable"
    assert Reservation.objects.count() == 1


def test_t_04_5_full_slot_still_marked_available_is_caught_by_the_count(owner: Owner) -> None:
    """The count under lock is the guard, not the state (inconsistent data cannot overbook)."""
    slot = slot_of(owner)
    make_reservation(slot, make_student("ana@unal.edu.co"))

    with pytest.raises(ReservationConflictError) as exc:
        reserve_slot(student=make_student("luis@unal.edu.co"), slot=slot)

    assert exc.value.code == "slot_full"


@pytest.mark.parametrize("status", [SlotStatus.CANCELLED, SlotStatus.EXPIRED])
def test_t_04_5_withdrawn_or_expired_slot_is_a_conflict(owner: Owner, status: SlotStatus) -> None:
    with pytest.raises(ReservationConflictError):
        reserve_slot(student=make_student(), slot=slot_of(owner, status=status))


def test_slot_of_a_deactivated_monitor_is_not_bookable(owner: Owner) -> None:
    slot = slot_of(owner)
    User.objects.filter(pk=owner[0].pk).update(is_active=False)

    with pytest.raises(ReservationConflictError):
        reserve_slot(student=make_student(), slot=slot)


# --- T-04.23 · one reservation per student and slot (ADR-010 R3) ------------------------------


def test_t_04_23_same_student_twice_on_a_group_slot_is_a_conflict(owner: Owner) -> None:
    slot = slot_of(owner, capacity=3)
    student = make_student()
    reserve_slot(student=student, slot=slot)

    with pytest.raises(ReservationConflictError) as exc:
        reserve_slot(student=student, slot=slot)

    assert exc.value.code == "already_reserved"
    assert Reservation.objects.count() == 1


def test_t_04_23_unique_violation_from_a_concurrent_request_is_a_conflict(owner: Owner) -> None:
    """If the checks are passed and the index still refuses the row, it is a 409, not a 500."""
    slot = slot_of(owner, capacity=3)
    student = make_student()
    make_reservation(slot, student)

    with (
        mock.patch("apps.reservations.services._already_reserved", return_value=False),
        mock.patch("apps.reservations.services._own_confirmed_between", return_value=[]),
        mock.patch("apps.reservations.services._active_in_week", return_value=0),
        pytest.raises(ReservationConflictError) as exc,
    ):
        reserve_slot(student=student, slot=slot)

    assert exc.value.code == "already_reserved"
    assert Reservation.objects.count() == 1


# --- T-04.7 · past slot (CA-HU03-4) and minimum advance (RN-004.6) ---------------------------


def test_t_04_7_ca_hu03_4_past_slot_is_rejected(owner: Owner) -> None:
    slot = slot_of(owner, starts_at=soon(-3))

    with pytest.raises(ReservationRuleError, match="ya comenzó o pasó"):
        reserve_slot(student=make_student(), slot=slot)

    assert not Reservation.objects.exists()


def test_t_04_7_rn_004_6_slot_inside_the_minimum_advance_is_rejected(owner: Owner) -> None:
    with pytest.raises(ReservationRuleError, match="2 horas"):
        reserve_slot(student=make_student(), slot=slot_of(owner, starts_at=soon(1.5)))


# --- T-04.8 · own overlap (CA-HU03-5, RN-004.4) ----------------------------------------------


def test_t_04_8_ca_hu03_5_overlapping_own_reservation_is_rejected() -> None:
    first = make_slot(*make_assigned_monitor("sofia@unal.edu.co"))
    other_subject = make_subject("FIS-201", "Mecánica")
    second = make_slot(
        *make_assigned_monitor("andres@unal.edu.co", other_subject),
        starts_at=SLOT_START + timedelta(minutes=30),
    )
    student = make_student()
    reserve_slot(student=student, slot=first)

    with pytest.raises(ReservationRuleError, match="ya tienes una reserva"):
        reserve_slot(student=student, slot=second)


def test_t_04_8_cancelled_reservation_does_not_block_the_time() -> None:
    first = make_slot(*make_assigned_monitor("sofia@unal.edu.co"))
    second = make_slot(
        *make_assigned_monitor("andres@unal.edu.co", make_subject("FIS-201", "Mecánica")),
        starts_at=SLOT_START,
    )
    student = make_student()
    make_reservation(first, student, status=ReservationStatus.CANCELLED)

    assert reserve_slot(student=student, slot=second).status == ReservationStatus.CONFIRMED


# --- T-04.9 · active limit per subject and week (RN-004.7, ADR-010) ---------------------------


def test_t_04_9_rn_004_7_second_active_reservation_same_subject_and_week_is_rejected(
    owner: Owner,
) -> None:
    student = make_student()
    reserve_slot(student=student, slot=slot_of(owner))

    with pytest.raises(ReservationRuleError, match="por asignatura y semana"):
        reserve_slot(student=student, slot=slot_of(owner, starts_at=SLOT_START + 2 * HOUR))


def test_t_04_9_the_next_week_and_other_subjects_are_free(owner: Owner) -> None:
    student = make_student()
    reserve_slot(student=student, slot=slot_of(owner))
    other = make_assigned_monitor("andres@unal.edu.co", make_subject("FIS-201", "Mecánica"))

    reserve_slot(student=student, slot=slot_of(owner, starts_at=SLOT_START + timedelta(days=7)))
    reserve_slot(student=student, slot=make_slot(*other, starts_at=SLOT_START + 2 * HOUR))

    assert student.reservations.count() == 3


@override_settings(RESERVATION_MAX_ACTIVE_PER_SUBJECT_WEEK=2)
def test_t_04_9_limit_is_configurable(owner: Owner) -> None:
    student = make_student()

    reserve_slot(student=student, slot=slot_of(owner))
    reserve_slot(student=student, slot=slot_of(owner, starts_at=SLOT_START + 2 * HOUR))

    assert student.reservations.count() == 2


# --- T-04.10 · role (CA-HU03-6) --------------------------------------------------------------


@pytest.mark.parametrize("code", [Role.Code.MONITOR, Role.Code.TEACHER, Role.Code.ADMIN])
def test_t_04_10_ca_hu03_6_only_students_reserve(owner: Owner, code: str) -> None:
    with pytest.raises(ReservationForbiddenError):
        reserve_slot(
            student=make_user(f"otro.{code.lower()}@unal.edu.co", code), slot=slot_of(owner)
        )

    assert not Reservation.objects.exists()


def test_t_04_10_monitor_who_is_also_a_student_cannot_book_their_own_slot(owner: Owner) -> None:
    monitor = owner[0]
    monitor.user_roles.create(role=Role.objects.get(code=Role.Code.STUDENT))

    with pytest.raises(ReservationRuleError, match="tu propia franja"):
        reserve_slot(student=monitor, slot=slot_of(owner))


def test_t_04_10_monitor_who_is_also_a_student_books_another_monitors_slot(owner: Owner) -> None:
    other, _, _ = make_assigned_monitor("andres@unal.edu.co", owner[1], owner[2])
    other.user_roles.create(role=Role.objects.get(code=Role.Code.STUDENT))

    assert reserve_slot(student=other, slot=slot_of(owner)).student == other


# --- T-04.11 · atomicity (RN-004.5, DDD 4.4 invariant 4) -------------------------------------


def test_t_04_11_failing_slot_update_leaves_no_reservation(owner: Owner) -> None:
    slot = slot_of(owner)

    with (
        mock.patch.object(AvailabilitySlot, "transition_to", side_effect=RuntimeError("boom")),
        pytest.raises(RuntimeError),
    ):
        reserve_slot(student=make_student(), slot=slot)

    assert not Reservation.objects.exists()
    assert refreshed(slot).status == SlotStatus.AVAILABLE


def test_t_04_11_failing_slot_release_keeps_the_reservation_confirmed(owner: Owner) -> None:
    slot = slot_of(owner)
    student = make_student()
    reservation = reserve_slot(student=student, slot=slot)

    with (
        mock.patch.object(AvailabilitySlot, "transition_to", side_effect=RuntimeError("boom")),
        pytest.raises(RuntimeError),
    ):
        cancel_reservation(reservation=reservation, actor=student)

    reservation.refresh_from_db()
    assert reservation.status == ReservationStatus.CONFIRMED
    assert reservation.cancelled_at is None
    assert refreshed(slot).status == SlotStatus.RESERVED


# --- T-04.12 · cancel in time (CA-HU04-1, RN-005.2) ------------------------------------------


def test_t_04_12_ca_hu04_1_cancel_in_time_frees_the_slot(owner: Owner) -> None:
    slot = slot_of(owner)
    student = make_student()
    reservation = reserve_slot(student=student, slot=slot)

    cancelled = cancel_reservation(reservation=reservation, actor=student)

    cancelled.refresh_from_db()
    assert cancelled.status == ReservationStatus.CANCELLED
    assert cancelled.cancelled_by == student
    assert cancelled.cancelled_at is not None
    assert refreshed(slot).status == SlotStatus.AVAILABLE


def test_t_04_12_student_may_leave_an_optional_reason(owner: Owner) -> None:
    student = make_student()
    reservation = reserve_slot(student=student, slot=slot_of(owner))

    cancel_reservation(reservation=reservation, actor=student, reason="  Choque de horario ")

    reservation.refresh_from_db()
    assert reservation.cancellation_reason == "Choque de horario"


# --- T-04.13 · late cancellation (CA-HU04-2, ADR-011) ----------------------------------------


def test_t_04_13_ca_hu04_2_late_cancellation_is_a_no_show_that_frees_the_seat(
    owner: Owner,
) -> None:
    slot = slot_of(owner, starts_at=soon(3), status=SlotStatus.RESERVED)
    student = make_student()
    reservation = make_reservation(slot, student)

    cancel_reservation(reservation=reservation, actor=student)

    reservation.refresh_from_db()
    assert reservation.status == ReservationStatus.NO_SHOW
    assert reservation.cancelled_by == student
    assert reservation.cancelled_at is not None
    assert refreshed(slot).status == SlotStatus.AVAILABLE


@override_settings(RESERVATION_CANCEL_WINDOW_HOURS=2)
def test_t_04_13_window_is_configurable(owner: Owner) -> None:
    slot = slot_of(owner, starts_at=soon(3), status=SlotStatus.RESERVED)
    student = make_student()
    reservation = make_reservation(slot, student)

    cancel_reservation(reservation=reservation, actor=student)

    reservation.refresh_from_db()
    assert reservation.status == ReservationStatus.CANCELLED


def test_t_04_13_started_session_cannot_be_cancelled(owner: Owner) -> None:
    slot = slot_of(owner, starts_at=soon(-0.5), status=SlotStatus.RESERVED)
    student = make_student()
    reservation = make_reservation(slot, student)

    with pytest.raises(ReservationRuleError, match="ya comenzó"):
        cancel_reservation(reservation=reservation, actor=student)

    reservation.refresh_from_db()
    assert reservation.status == ReservationStatus.CONFIRMED


# --- T-04.14 · third party (CA-HU04-3, RN-005.4) ---------------------------------------------


@pytest.mark.parametrize("code", [Role.Code.STUDENT, Role.Code.MONITOR, Role.Code.TEACHER])
def test_t_04_14_ca_hu04_3_third_party_cannot_cancel(owner: Owner, code: str) -> None:
    reservation = reserve_slot(student=make_student(), slot=slot_of(owner))
    stranger = make_user(f"otro.{code.lower()}@unal.edu.co", code)

    with pytest.raises(ReservationForbiddenError):
        cancel_reservation(reservation=reservation, actor=stranger, reason="Porque sí")

    reservation.refresh_from_db()
    assert reservation.status == ReservationStatus.CONFIRMED


# --- T-04.15 · double cancellation (CA-HU04-4, RN-005.3) -------------------------------------


@pytest.mark.parametrize("status", [ReservationStatus.CANCELLED, ReservationStatus.NO_SHOW])
def test_t_04_15_ca_hu04_4_ended_reservation_cannot_be_cancelled_again(
    owner: Owner,
    status: ReservationStatus,
) -> None:
    student = make_student()
    reservation = make_reservation(slot_of(owner), student, status=status)

    with pytest.raises(ReservationConflictError) as exc:
        cancel_reservation(reservation=reservation, actor=student)

    assert exc.value.code == "already_cancelled"


def test_t_04_15_stale_copy_cannot_cancel_twice(owner: Owner) -> None:
    """Two cancel requests read the same row; the second sees the committed state under lock."""
    student = make_student()
    reservation = reserve_slot(student=student, slot=slot_of(owner))
    stale = Reservation.objects.get(pk=reservation.pk)
    cancel_reservation(reservation=reservation, actor=student)

    with pytest.raises(ReservationConflictError):
        cancel_reservation(reservation=stale, actor=student)


# --- T-04.16 · cancellation by the monitor (RN-005.5, ADR-011) -------------------------------


def test_t_04_16_monitor_cancels_with_a_reason_and_is_recorded_as_author(owner: Owner) -> None:
    slot = slot_of(owner, starts_at=soon(3), status=SlotStatus.RESERVED)
    reservation = make_reservation(slot, make_student())
    monitor = owner[0]

    cancel_reservation(reservation=reservation, actor=monitor, reason="  Estoy enfermo ")

    reservation.refresh_from_db()
    # The window is the student's: a monitor's late cancellation is never the student's no-show.
    assert reservation.status == ReservationStatus.CANCELLED
    assert reservation.cancelled_by == monitor
    assert reservation.cancellation_reason == "Estoy enfermo"
    assert refreshed(slot).status == SlotStatus.AVAILABLE


@pytest.mark.parametrize("reason", ["", "   "])
def test_t_04_16_monitor_cancellation_requires_a_reason(owner: Owner, reason: str) -> None:
    reservation = reserve_slot(student=make_student(), slot=slot_of(owner))

    with pytest.raises(ReservationRuleError, match="justificación"):
        cancel_reservation(reservation=reservation, actor=owner[0], reason=reason)

    reservation.refresh_from_db()
    assert reservation.status == ReservationStatus.CONFIRMED


def test_t_04_16_admin_cancels_with_a_reason(owner: Owner) -> None:
    reservation = reserve_slot(student=make_student(), slot=slot_of(owner))
    admin = make_user("admin@unal.edu.co", Role.Code.ADMIN)

    with pytest.raises(ReservationRuleError):
        cancel_reservation(reservation=reservation, actor=admin)
    cancel_reservation(reservation=reservation, actor=admin, reason="Cierre de la sede")

    reservation.refresh_from_db()
    assert reservation.status == ReservationStatus.CANCELLED
    assert reservation.cancelled_by == admin


# --- RF-047 · optional student note ---------------------------------------------------------


def test_rf_047_reserve_stores_the_trimmed_note(owner: Owner) -> None:
    reservation = reserve_slot(student=make_student(), slot=slot_of(owner), note="  Derivadas  ")

    reservation.refresh_from_db()
    assert reservation.student_note == "Derivadas"


def test_rf_047_too_long_note_creates_nothing(owner: Owner) -> None:
    with pytest.raises(ReservationRuleError, match="500"):
        reserve_slot(student=make_student(), slot=slot_of(owner), note="x" * 501)

    assert not Reservation.objects.exists()
