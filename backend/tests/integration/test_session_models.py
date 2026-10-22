"""Tutoring-session models and their database guarantees (T-05.1, T-05.2, DDD 4.5, RN-006.3)."""

import pytest
from django.db import IntegrityError, transaction

from apps.reservations.domain.rules import ReservationConflictError, ReservationStatus
from apps.tutoring_sessions.models import SessionAttendance, Topic, TutoringSession
from tests.availability_data import make_assigned_monitor
from tests.catalog_data import make_subject
from tests.reservation_data import make_reservation, make_student
from tests.session_data import (
    make_attendance,
    make_session,
    make_started_slot,
    make_topic,
)

pytestmark = pytest.mark.django_db


# --- T-05.1 · Topic ----------------------------------------------------------------------------


def test_t_05_1_topic_name_is_unique_per_subject_ignoring_case() -> None:
    calculo = make_subject()
    make_topic(calculo, "Regla de la cadena")

    with pytest.raises(IntegrityError) as exc, transaction.atomic():
        make_topic(calculo, "REGLA DE LA CADENA")

    assert "sessions_topic_unique_name_per_subject" in str(exc.value)
    assert Topic.objects.count() == 1


def test_t_05_1_the_same_topic_name_is_allowed_in_another_subject() -> None:
    make_topic(make_subject(), "Límites")

    make_topic(make_subject("1000005", "Cálculo Integral"), "Límites")

    assert Topic.objects.count() == 2


# --- T-05.2 · one session per slot, one attendance per reservation (RN-006.3) -----------------


def test_t_05_2_rn_006_3_a_slot_admits_at_most_one_session() -> None:
    slot = make_started_slot(*make_assigned_monitor())
    make_session(slot)

    with pytest.raises(IntegrityError), transaction.atomic():
        make_session(slot)

    assert TutoringSession.objects.count() == 1


def test_t_05_2_rn_006_3_a_reservation_admits_at_most_one_attendance() -> None:
    slot = make_started_slot(*make_assigned_monitor(), capacity=2)
    reservation = make_reservation(slot, make_student())
    session = make_session(slot)
    make_attendance(session, reservation)

    with pytest.raises(IntegrityError), transaction.atomic():
        make_attendance(session, reservation)

    assert SessionAttendance.objects.count() == 1


def test_t_05_2_attendance_outside_the_allowed_values_is_rejected_by_the_database() -> None:
    slot = make_started_slot(*make_assigned_monitor())
    session = make_session(slot)
    reservation = make_reservation(slot, make_student())

    with pytest.raises(IntegrityError), transaction.atomic():
        SessionAttendance.objects.create(
            session=session, reservation=reservation, attendance="LATE"
        )


@pytest.mark.parametrize("minutes", [0, 181])
def test_t_05_2_duration_outside_the_range_is_rejected_by_the_database(minutes: int) -> None:
    slot = make_started_slot(*make_assigned_monitor())

    with pytest.raises(IntegrityError), transaction.atomic():
        make_session(slot, duration_minutes=minutes)


def test_t_05_2_session_keeps_its_topics() -> None:
    monitor, calculo, term = make_assigned_monitor()
    session = make_session(make_started_slot(monitor, calculo, term))
    cadena, limites = make_topic(calculo, "Regla de la cadena"), make_topic(calculo, "Límites")

    session.topics.set([cadena, limites])

    assert set(session.topics.all()) == {cadena, limites}
    assert session.recorded_at is not None


# --- RN-006.5 · the session closes the reservation (DDD §6.2) ---------------------------------


@pytest.mark.parametrize("target", [ReservationStatus.COMPLETED, ReservationStatus.NO_SHOW])
def test_t_05_8_rn_006_5_close_by_session_saves_the_outcome(target: ReservationStatus) -> None:
    reservation = make_reservation(make_started_slot(*make_assigned_monitor()), make_student())

    reservation.close_by_session(target)

    reservation.refresh_from_db()
    assert reservation.status == target
    assert reservation.cancelled_at is None


def test_t_05_8_close_by_session_leaves_a_cancelled_reservation_untouched() -> None:
    reservation = make_reservation(
        make_started_slot(*make_assigned_monitor()),
        make_student(),
        status=ReservationStatus.CANCELLED,
    )

    with pytest.raises(ReservationConflictError):
        reservation.close_by_session(ReservationStatus.COMPLETED)

    reservation.refresh_from_db()
    assert reservation.status == ReservationStatus.CANCELLED
