"""Reservation model: states and the database-level invariant (T-04.2, T-04.3, T-04.23).

RN-004.3 and ADR-010 R3: a student holds at most one CONFIRMED reservation per slot, enforced
by a partial unique index in PostgreSQL, not only by the service.
"""

import pytest
from django.db import IntegrityError, connection, transaction

from apps.reservations.domain.rules import ReservationConflictError, ReservationStatus
from apps.reservations.models import Reservation
from tests.availability_data import make_assigned_monitor, make_slot
from tests.reservation_data import make_reservation, make_student

pytestmark = pytest.mark.django_db

UNIQUE_CONSTRAINT = "reservations_one_confirmed_per_student_and_slot"


def test_t_04_2_new_reservation_is_confirmed_with_a_uuid_and_creation_time() -> None:
    reservation = make_reservation(make_slot(*make_assigned_monitor()), make_student())

    assert reservation.status == ReservationStatus.CONFIRMED
    assert reservation.pk.version == 4
    assert reservation.created_at is not None
    assert reservation.cancelled_at is None
    assert reservation.cancelled_by is None
    assert reservation.cancellation_reason == ""


def test_t_04_2_transition_saves_the_new_state() -> None:
    reservation = make_reservation(make_slot(*make_assigned_monitor()), make_student())

    reservation.transition_to(ReservationStatus.CANCELLED)

    reservation.refresh_from_db()
    assert reservation.status == ReservationStatus.CANCELLED


@pytest.mark.parametrize(
    ("current", "target"),
    [
        (ReservationStatus.CANCELLED, ReservationStatus.CONFIRMED),
        (ReservationStatus.COMPLETED, ReservationStatus.CANCELLED),
        (ReservationStatus.NO_SHOW, ReservationStatus.COMPLETED),
        (ReservationStatus.CONFIRMED, ReservationStatus.COMPLETED),
    ],
)
def test_t_04_2_forbidden_transitions_leave_the_row_untouched(
    current: ReservationStatus, target: ReservationStatus
) -> None:
    reservation = make_reservation(
        make_slot(*make_assigned_monitor()), make_student(), status=current
    )

    with pytest.raises(ReservationConflictError):
        reservation.transition_to(target)

    reservation.refresh_from_db()
    assert reservation.status == current


def test_t_04_3_rn_004_3_two_confirmed_reservations_of_one_student_on_one_slot_fail() -> None:
    slot = make_slot(*make_assigned_monitor(), capacity=3)
    student = make_student()
    make_reservation(slot, student)

    with pytest.raises(IntegrityError) as exc, transaction.atomic():
        make_reservation(slot, student)

    assert UNIQUE_CONSTRAINT in str(exc.value)
    assert Reservation.objects.count() == 1


def test_t_04_23_cancelled_reservations_do_not_block_booking_again() -> None:
    slot = make_slot(*make_assigned_monitor(), capacity=3)
    student = make_student()
    make_reservation(slot, student, status=ReservationStatus.CANCELLED)
    make_reservation(slot, student, status=ReservationStatus.NO_SHOW)

    make_reservation(slot, student)

    assert Reservation.objects.filter(status=ReservationStatus.CONFIRMED).count() == 1


def test_t_04_23_other_students_share_a_group_slot() -> None:
    slot = make_slot(*make_assigned_monitor(), capacity=3)

    make_reservation(slot, make_student("ana@unal.edu.co"))
    make_reservation(slot, make_student("luis@unal.edu.co"))

    assert slot.reservations.count() == 2


def test_status_outside_the_state_machine_is_rejected_by_the_database() -> None:
    reservation = make_reservation(make_slot(*make_assigned_monitor()), make_student())

    with pytest.raises(IntegrityError), transaction.atomic():
        Reservation.objects.filter(pk=reservation.pk).update(status="PENDING")


def test_t_04_3_the_partial_unique_index_exists_in_postgresql() -> None:
    """FASE-04 §9: the constraint lives in the database, not only in the model code."""
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT indexdef FROM pg_indexes WHERE tablename = %s AND indexname = %s",
            ["reservations_reservation", UNIQUE_CONSTRAINT],
        )
        row = cursor.fetchone()

    assert row is not None
    definition = row[0]
    assert "UNIQUE" in definition
    assert "(slot_id, student_id)" in definition
    assert "WHERE" in definition
    assert "'CONFIRMED'" in definition
