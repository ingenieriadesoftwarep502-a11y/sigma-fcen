"""Session use cases: record, edit and the topic catalog (T-05.3 to T-05.10, T-05.18 to T-05.21).

CA-HU06-1 to CA-HU06-5, RN-006.1 to RN-006.8, RF-052.
"""

from datetime import timedelta
from typing import Any
from unittest import mock
from uuid import UUID

import pytest
from django.utils import timezone

from apps.accounts.models import Role, User
from apps.reservations.domain.rules import ReservationStatus
from apps.reservations.models import Reservation
from apps.tutoring_sessions import services
from apps.tutoring_sessions.domain.rules import (
    AttendanceStatus,
    SessionConflictError,
    SessionForbiddenError,
    SessionRuleError,
)
from apps.tutoring_sessions.models import SessionAttendance, Topic, TutoringSession
from apps.tutoring_sessions.services import create_topic, record_session, update_session
from tests.availability_data import SLOT_START, make_assigned_monitor, make_slot
from tests.catalog_data import make_subject, make_user
from tests.material_data import make_document
from tests.reservation_data import make_reservation, make_student
from tests.session_data import make_session, make_started_slot, make_topic

pytestmark = pytest.mark.django_db

ATTENDED = AttendanceStatus.ATTENDED
NO_SHOW = AttendanceStatus.NO_SHOW


@pytest.fixture
def world() -> dict[str, Any]:
    sofia, calculo, term = make_assigned_monitor("sofia.diaz@unal.edu.co")
    slot = make_started_slot(sofia, calculo, term, capacity=3)
    ana = make_student("ana.perez@unal.edu.co")
    luis = make_student("luis.gomez@unal.edu.co")
    return {
        "sofia": sofia,
        "calculo": calculo,
        "term": term,
        "slot": slot,
        "ana": ana,
        "luis": luis,
        "ana_reservation": make_reservation(slot, ana),
        "luis_reservation": make_reservation(slot, luis),
        "cadena": make_topic(calculo, "Regla de la cadena"),
    }


def marks(*pairs: tuple[Reservation, AttendanceStatus]) -> list[tuple[UUID, AttendanceStatus]]:
    return [(reservation.pk, attendance) for reservation, attendance in pairs]


def record(world: dict[str, Any], **overrides: Any) -> TutoringSession:
    data: dict[str, Any] = {
        "monitor": world["sofia"],
        "slot": world["slot"],
        "attendance": marks(
            (world["ana_reservation"], ATTENDED), (world["luis_reservation"], NO_SHOW)
        ),
        "topic_ids": [world["cadena"].pk],
        "material_ids": [],
        "notes": "Repasamos derivadas.",
        "duration_minutes": None,
    }
    data.update(overrides)
    return record_session(**data)


def status_of(reservation: Reservation) -> str:
    reservation.refresh_from_db()
    return reservation.status


# --- T-05.5 · valid record (CA-HU06-1) --------------------------------------------------------


def test_t_05_5_ca_hu06_1_session_is_recorded_on_the_slot_and_its_reservations(
    world: dict[str, Any],
) -> None:
    session = record(world)

    assert session.slot == world["slot"]
    assert session.recorded_by == world["sofia"]
    assert list(session.topics.all()) == [world["cadena"]]
    assert session.notes == "Repasamos derivadas."
    assert session.duration_minutes == 60  # the slot's length by default
    assert {(row.reservation_id, row.attendance) for row in session.attendances.all()} == {
        (world["ana_reservation"].pk, "ATTENDED"),
        (world["luis_reservation"].pk, "NO_SHOW"),
    }


def test_t_05_8_rn_006_5_attended_reservation_becomes_completed(world: dict[str, Any]) -> None:
    record(world)

    assert status_of(world["ana_reservation"]) == ReservationStatus.COMPLETED


def test_t_05_7_ca_hu06_4_no_show_reservation_becomes_no_show(world: dict[str, Any]) -> None:
    record(world)

    luis_reservation = world["luis_reservation"]
    assert status_of(luis_reservation) == ReservationStatus.NO_SHOW
    luis_reservation.refresh_from_db()
    assert luis_reservation.cancelled_at is None  # a missed session, not a cancellation


def test_t_05_5_duration_and_material_of_the_subject_are_kept(world: dict[str, Any]) -> None:
    taller = make_document(world["calculo"], world["sofia"])

    session = record(world, duration_minutes=75, material_ids=[taller.pk])

    assert session.duration_minutes == 75
    assert list(session.materials.all()) == [taller]


# --- T-05.4 · the slot already started (CA-HU06-2, RN-006.2) ----------------------------------


def test_t_05_4_ca_hu06_2_future_slot_is_rejected(world: dict[str, Any]) -> None:
    future = make_slot(world["sofia"], world["calculo"], world["term"], SLOT_START)
    reservation = make_reservation(future, world["ana"])

    with pytest.raises(SessionRuleError, match="aún no ha comenzado"):
        record(world, slot=future, attendance=marks((reservation, ATTENDED)))

    assert not TutoringSession.objects.exists()
    assert status_of(reservation) == ReservationStatus.CONFIRMED


# --- T-05.3 · confirmed reservations only (RN-006.1) ------------------------------------------


def test_t_05_3_rn_006_1_slot_without_confirmed_reservations_is_rejected(
    world: dict[str, Any],
) -> None:
    empty = make_started_slot(world["sofia"], world["calculo"], world["term"], hours_ago=5)
    make_reservation(empty, world["ana"], status=ReservationStatus.CANCELLED)

    with pytest.raises(SessionRuleError, match="no tiene reservas confirmadas"):
        record(world, slot=empty, attendance=[], topic_ids=[])


def test_t_05_3_rn_006_1_late_cancellations_are_not_marked(world: dict[str, Any]) -> None:
    late = make_reservation(
        world["slot"], make_student("eva@unal.edu.co"), status=ReservationStatus.NO_SHOW
    )

    with pytest.raises(SessionRuleError, match="no está confirmada en esta franja"):
        record(
            world,
            attendance=marks(
                (world["ana_reservation"], ATTENDED),
                (world["luis_reservation"], ATTENDED),
                (late, ATTENDED),
            ),
        )


# --- T-05.18 · every confirmed reservation is marked (RN-006.5) -------------------------------


def test_t_05_18_rn_006_5_a_missing_reservation_is_rejected(world: dict[str, Any]) -> None:
    with pytest.raises(SessionRuleError, match="todas las reservas"):
        record(world, attendance=marks((world["ana_reservation"], ATTENDED)))

    assert status_of(world["ana_reservation"]) == ReservationStatus.CONFIRMED


def test_t_05_18_rn_006_5_a_reservation_of_another_slot_is_rejected(
    world: dict[str, Any],
) -> None:
    other = make_started_slot(world["sofia"], world["calculo"], world["term"], hours_ago=5)
    foreign = make_reservation(other, world["ana"])

    with pytest.raises(SessionRuleError, match="no está confirmada en esta franja"):
        record(
            world,
            attendance=marks(
                (world["ana_reservation"], ATTENDED),
                (world["luis_reservation"], ATTENDED),
                (foreign, ATTENDED),
            ),
        )


# --- T-05.6 · duplicate session (CA-HU06-3, RN-006.3) -----------------------------------------


def test_t_05_6_ca_hu06_3_second_session_on_the_slot_is_a_conflict(
    world: dict[str, Any],
) -> None:
    make_session(world["slot"])

    with pytest.raises(SessionConflictError) as exc:
        record(world)

    assert exc.value.code == "already_recorded"
    assert TutoringSession.objects.count() == 1


def test_t_05_6_rn_006_3_a_duplicate_past_the_check_is_still_a_conflict(
    world: dict[str, Any],
) -> None:
    """The one-to-one on the slot is the last line of defence, never a 500."""
    make_session(world["slot"])

    with (
        mock.patch.object(services, "_already_recorded", return_value=False),
        pytest.raises(SessionConflictError) as exc,
    ):
        record(world)

    assert exc.value.code == "already_recorded"
    assert TutoringSession.objects.count() == 1


# --- T-05.9 · only the slot's monitor (CA-HU06-5, RN-006.4) -----------------------------------


def test_t_05_9_ca_hu06_5_another_monitor_is_forbidden(world: dict[str, Any]) -> None:
    andres, _, _ = make_assigned_monitor("andres@unal.edu.co", world["calculo"], world["term"])

    with pytest.raises(SessionForbiddenError):
        record(world, monitor=andres)

    assert not TutoringSession.objects.exists()


# --- T-05.20 · topics and material of the subject (RN-006.7) ----------------------------------


def test_t_05_20_rn_006_7_attended_session_without_topics_is_rejected(
    world: dict[str, Any],
) -> None:
    with pytest.raises(SessionRuleError, match="al menos un tema"):
        record(world, topic_ids=[])


def test_t_05_20_session_where_nobody_came_needs_no_topics(world: dict[str, Any]) -> None:
    session = record(
        world,
        topic_ids=[],
        attendance=marks((world["ana_reservation"], NO_SHOW), (world["luis_reservation"], NO_SHOW)),
    )

    assert not session.topics.exists()
    assert status_of(world["ana_reservation"]) == ReservationStatus.NO_SHOW


def test_t_05_20_topic_of_another_subject_is_rejected(world: dict[str, Any]) -> None:
    algebra_topic = make_topic(make_subject("1000003", "Álgebra Lineal"), "Matrices")

    with pytest.raises(SessionRuleError, match="no pertenece a la asignatura") as exc:
        record(world, topic_ids=[algebra_topic.pk])

    assert exc.value.field == "topic_ids"


def test_t_05_20_material_of_another_subject_or_removed_is_rejected(
    world: dict[str, Any],
) -> None:
    algebra = make_subject("1000003", "Álgebra Lineal")
    foreign = make_document(algebra, world["sofia"])
    removed = make_document(world["calculo"], world["sofia"], "Viejo", is_active=False)

    for material in (foreign, removed):
        with pytest.raises(SessionRuleError, match="no está disponible") as exc:
            record(world, material_ids=[material.pk])
        assert exc.value.field == "material_ids"


# --- T-05.19 · atomicity (RN-006.5) ------------------------------------------------------------


def test_t_05_19_a_failure_midway_leaves_no_session_and_no_changed_reservation(
    world: dict[str, Any],
) -> None:
    original = Reservation.close_by_session
    calls = 0

    def fail_on_second(self: Reservation, target: ReservationStatus) -> None:
        nonlocal calls
        calls += 1
        if calls == 2:
            raise RuntimeError("fallo intermedio")
        original(self, target)

    with (
        mock.patch.object(Reservation, "close_by_session", fail_on_second),
        pytest.raises(RuntimeError),
    ):
        record(world)

    assert not TutoringSession.objects.exists()
    assert not SessionAttendance.objects.exists()
    assert status_of(world["ana_reservation"]) == ReservationStatus.CONFIRMED
    assert status_of(world["luis_reservation"]) == ReservationStatus.CONFIRMED


# --- T-05.10 · edit window and what can be edited (RN-006.6, RN-006.8, RF-052) -----------------


def test_t_05_10_rn_006_6_inside_the_window_topics_notes_and_duration_change(
    world: dict[str, Any],
) -> None:
    session = record(world)
    limites = make_topic(world["calculo"], "Límites")

    updated = update_session(
        session=session,
        actor=world["sofia"],
        changes={"topic_ids": [limites.pk], "notes": "  Nueva nota ", "duration_minutes": 45},
    )

    assert list(updated.topics.all()) == [limites]
    assert updated.notes == "Nueva nota"
    assert updated.duration_minutes == 45


def test_t_05_10_rn_006_6_after_48_hours_the_session_is_final(world: dict[str, Any]) -> None:
    session = make_session(world["slot"], recorded_at=timezone.now() - timedelta(hours=48))

    with pytest.raises(SessionConflictError, match="48 horas") as exc:
        update_session(session=session, actor=world["sofia"], changes={"notes": "Tarde"})

    assert exc.value.code == "edit_window_closed"
    session.refresh_from_db()
    assert session.notes == ""


def test_t_05_10_rn_006_4_only_the_slot_monitor_edits(world: dict[str, Any]) -> None:
    session = record(world)

    with pytest.raises(SessionForbiddenError):
        update_session(session=session, actor=world["ana"], changes={"notes": "Hackeado"})


def test_t_05_10_rn_006_7_edit_cannot_remove_every_topic_if_someone_attended(
    world: dict[str, Any],
) -> None:
    session = record(world)

    with pytest.raises(SessionRuleError, match="al menos un tema"):
        update_session(session=session, actor=world["sofia"], changes={"topic_ids": []})


def test_t_05_10_edit_rejects_a_topic_of_another_subject(world: dict[str, Any]) -> None:
    session = record(world)
    matrices = make_topic(make_subject("1000003", "Álgebra Lineal"), "Matrices")

    with pytest.raises(SessionRuleError, match="no pertenece a la asignatura"):
        update_session(session=session, actor=world["sofia"], changes={"topic_ids": [matrices.pk]})


# --- T-05.21 · topic catalog --------------------------------------------------------------------


def test_t_05_21_assigned_monitor_creates_a_topic(world: dict[str, Any]) -> None:
    topic, created = create_topic(
        actor=world["sofia"], subject=world["calculo"], name="  Integrales   dobles "
    )

    assert created is True
    assert topic.name == "Integrales dobles"
    assert topic.created_by == world["sofia"]


def test_t_05_21_creating_an_existing_topic_returns_it(world: dict[str, Any]) -> None:
    topic, created = create_topic(
        actor=world["sofia"], subject=world["calculo"], name="regla  DE la cadena"
    )

    assert created is False
    assert topic == world["cadena"]
    assert Topic.objects.count() == 1


def test_t_05_21_monitor_of_another_subject_cannot_create_topics(world: dict[str, Any]) -> None:
    algebra = make_subject("1000003", "Álgebra Lineal")

    with pytest.raises(SessionForbiddenError):
        create_topic(actor=world["sofia"], subject=algebra, name="Matrices")


def test_t_05_21_administrator_creates_topics_in_any_subject(world: dict[str, Any]) -> None:
    admin = make_user("admin@unal.edu.co", Role.Code.ADMIN)

    topic, created = create_topic(actor=admin, subject=world["calculo"], name="Series")

    assert created is True
    assert topic.subject == world["calculo"]


def test_t_05_21_student_cannot_create_topics(world: dict[str, Any]) -> None:
    student: User = world["ana"]

    with pytest.raises(SessionForbiddenError):
        create_topic(actor=student, subject=world["calculo"], name="Series")


def test_t_05_21_a_concurrent_duplicate_returns_the_existing_topic(
    world: dict[str, Any],
) -> None:
    """Between the lookup and the insert another request may create it; that is not a 500."""
    with mock.patch.object(services, "_existing_topic", return_value=None):
        topic, created = create_topic(
            actor=world["sofia"], subject=world["calculo"], name="Regla de la cadena"
        )

    assert created is False
    assert topic == world["cadena"]
