"""Reservations HTTP API (FASE-04 §5): reserve, list, detail and cancel.

CA-HU03-1 to CA-HU03-6, CA-HU04-1 to CA-HU04-4, RF-045, RF-046, SAD §6.3 error format.
"""

from datetime import timedelta
from typing import Any

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.availability.domain.rules import SlotStatus
from apps.availability.models import AvailabilitySlot
from apps.reservations.domain.rules import ReservationStatus
from apps.reservations.models import Reservation
from tests.availability_data import HOUR, SLOT_START, make_assigned_monitor, make_slot
from tests.catalog_data import client_for, make_subject, make_user
from tests.reservation_data import make_reservation, make_student

pytestmark = pytest.mark.django_db

RESERVATIONS_URL = "/api/v1/reservations/"
MINE_URL = "/api/v1/reservations/mine/"
PROBLEM_KEYS = {"type", "title", "status", "detail", "instance"}


def detail_url(reservation: Reservation) -> str:
    return f"{RESERVATIONS_URL}{reservation.pk}/"


def cancel_url(reservation: Reservation) -> str:
    return f"{RESERVATIONS_URL}{reservation.pk}/cancel/"


@pytest.fixture
def world() -> dict[str, Any]:
    sofia, calculo, term = make_assigned_monitor("sofia.diaz@unal.edu.co")
    return {
        "sofia": sofia,
        "calculo": calculo,
        "term": term,
        "slot": make_slot(sofia, calculo, term),
        "ana": make_student("ana.perez@unal.edu.co", first_name="Ana", last_name="Pérez"),
        "luis": make_student("luis.gomez@unal.edu.co"),
    }


def reserve(user: User, slot: AvailabilitySlot, **body: Any) -> Any:
    return client_for(user).post(RESERVATIONS_URL, {"slot_id": slot.pk, **body}, format="json")


# --- POST /reservations/ ---------------------------------------------------------------------


def test_rnf_sec_reservations_require_authentication(world: dict[str, Any]) -> None:
    response = APIClient().post(RESERVATIONS_URL, {"slot_id": world["slot"].pk}, format="json")

    assert response.status_code == 401


def test_t_04_4_ca_hu03_1_student_reserves_and_gets_the_reservation(
    world: dict[str, Any],
) -> None:
    response = reserve(world["ana"], world["slot"])

    assert response.status_code == 201, response.json()
    data = response.json()
    assert data["status"] == "CONFIRMED"
    assert data["student"] == {"id": str(world["ana"].pk), "full_name": "Ana Pérez"}
    assert data["slot"]["id"] == world["slot"].pk
    assert data["slot"]["subject"]["id"] == world["calculo"].pk
    assert data["slot"]["monitor"]["id"] == str(world["sofia"].pk)
    assert data["cancelled_at"] is None
    world["slot"].refresh_from_db()
    assert world["slot"].status == SlotStatus.RESERVED


def test_t_04_4_student_is_never_taken_from_the_body(world: dict[str, Any]) -> None:
    """Sending another student's id must not book on their behalf (FASE-04 §5)."""
    response = reserve(world["ana"], world["slot"], student=str(world["luis"].pk))

    assert response.status_code == 201
    assert Reservation.objects.get().student == world["ana"]


def test_t_04_5_ca_hu03_2_reserved_slot_is_409_in_the_sad_format(world: dict[str, Any]) -> None:
    reserve(world["ana"], world["slot"])

    response = reserve(world["luis"], world["slot"])

    assert response.status_code == 409
    body = response.json()
    assert set(body) >= PROBLEM_KEYS
    assert body["status"] == 409
    assert body["type"] == "slot_unavailable"
    assert body["instance"] == RESERVATIONS_URL
    assert body["errors"] == {"slot_id": [body["detail"]]}
    assert Reservation.objects.count() == 1


def test_t_04_23_same_student_twice_on_a_group_slot_is_409(world: dict[str, Any]) -> None:
    slot = make_slot(world["sofia"], world["calculo"], world["term"], SLOT_START + 2 * HOUR)
    AvailabilitySlot.objects.filter(pk=slot.pk).update(capacity=3)
    reserve(world["ana"], slot)

    response = reserve(world["ana"], slot)

    assert response.status_code == 409
    assert response.json()["type"] == "already_reserved"


def test_t_04_7_ca_hu03_4_past_slot_is_400(world: dict[str, Any]) -> None:
    past = make_slot(
        world["sofia"], world["calculo"], world["term"], timezone.now() - timedelta(days=1)
    )

    response = reserve(world["ana"], past)

    assert response.status_code == 400
    body = response.json()
    assert body["type"] == "validation_error"
    assert "slot_id" in body["errors"]
    assert not Reservation.objects.exists()


def test_t_04_8_ca_hu03_5_own_overlap_is_400(world: dict[str, Any]) -> None:
    andres, mecanica, term = make_assigned_monitor(
        "andres@unal.edu.co", make_subject("FIS-201", "Mecánica"), world["term"]
    )
    reserve(world["ana"], world["slot"])

    response = reserve(world["ana"], make_slot(andres, mecanica, term))

    assert response.status_code == 400
    assert "ya tienes una reserva" in response.json()["errors"]["slot_id"][0]


@pytest.mark.parametrize("body", [{}, {"slot_id": "abc"}, {"slot_id": 999999}])
def test_invalid_or_unknown_slot_is_400(world: dict[str, Any], body: dict[str, Any]) -> None:
    response = client_for(world["ana"]).post(RESERVATIONS_URL, body, format="json")

    assert response.status_code == 400
    assert "slot_id" in response.json()["errors"]


@pytest.mark.parametrize("code", [Role.Code.MONITOR, Role.Code.TEACHER, Role.Code.ADMIN])
def test_t_04_10_ca_hu03_6_non_students_get_403(world: dict[str, Any], code: str) -> None:
    other = make_user(f"otro.{code.lower()}@unal.edu.co", code)

    response = reserve(other, world["slot"])

    assert response.status_code == 403
    assert response.json()["status"] == 403
    assert not Reservation.objects.exists()


# --- GET /reservations/mine/ (T-04.17, RF-045, RF-046) ----------------------------------------


def test_t_04_17_student_sees_only_their_own_reservations(world: dict[str, Any]) -> None:
    mine = make_reservation(world["slot"], world["ana"])
    other_slot = make_slot(world["sofia"], world["calculo"], world["term"], SLOT_START + 2 * HOUR)
    make_reservation(other_slot, world["luis"])

    response = client_for(world["ana"]).get(MINE_URL)

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    assert [item["id"] for item in body["results"]] == [str(mine.pk)]


def test_t_04_17_monitor_sees_the_reservations_of_their_slots(world: dict[str, Any]) -> None:
    on_sofia = make_reservation(world["slot"], world["ana"])
    andres, mecanica, term = make_assigned_monitor(
        "andres@unal.edu.co", make_subject("FIS-201", "Mecánica"), world["term"]
    )
    make_reservation(make_slot(andres, mecanica, term), world["luis"])

    response = client_for(world["sofia"]).get(MINE_URL)

    assert [item["id"] for item in response.json()["results"]] == [str(on_sofia.pk)]


def test_t_04_17_filters_by_status_and_time(world: dict[str, Any]) -> None:
    upcoming = make_reservation(world["slot"], world["ana"])
    past_slot = make_slot(
        world["sofia"], world["calculo"], world["term"], timezone.now() - timedelta(days=2)
    )
    past = make_reservation(past_slot, world["ana"], status=ReservationStatus.NO_SHOW)
    client = client_for(world["ana"])

    def ids(**params: str) -> list[str]:
        return [item["id"] for item in client.get(MINE_URL, params).json()["results"]]

    assert ids(when="upcoming") == [str(upcoming.pk)]
    assert ids(when="past") == [str(past.pk)]
    assert ids(status="NO_SHOW") == [str(past.pk)]
    assert client.get(MINE_URL, {"when": "ayer"}).status_code == 400


def test_t_04_17_list_is_paginated_and_runs_a_fixed_number_of_queries(
    world: dict[str, Any],
) -> None:
    for week in range(1, 6):
        slot = make_slot(
            world["sofia"], world["calculo"], world["term"], SLOT_START + timedelta(days=7 * week)
        )
        make_reservation(slot, world["ana"])
    client = client_for(world["ana"])

    with CaptureQueriesContext(connection) as few:
        client.get(MINE_URL, {"page_size": 2})
    with CaptureQueriesContext(connection) as many:
        response = client.get(MINE_URL, {"page_size": 5})

    assert response.json()["count"] == 5
    assert len(many) == len(few)


# --- GET /reservations/{id}/ ------------------------------------------------------------------


def test_participants_read_a_reservation_and_others_get_403(world: dict[str, Any]) -> None:
    reservation = make_reservation(world["slot"], world["ana"])
    admin = make_user("admin@unal.edu.co", Role.Code.ADMIN)

    for reader in (world["ana"], world["sofia"], admin):
        assert client_for(reader).get(detail_url(reservation)).status_code == 200
    response = client_for(world["luis"]).get(detail_url(reservation))
    assert response.status_code == 403
    assert response.json()["type"] == "permission_denied"


def test_unknown_reservation_is_404(world: dict[str, Any]) -> None:
    response = client_for(world["ana"]).get(
        f"{RESERVATIONS_URL}00000000-0000-4000-8000-000000000000/"
    )

    assert response.status_code == 404
    assert response.json()["status"] == 404


# --- POST /reservations/{id}/cancel/ -------------------------------------------------------


def test_t_04_12_ca_hu04_1_student_cancels_in_time(world: dict[str, Any]) -> None:
    reservation = Reservation.objects.get(pk=reserve(world["ana"], world["slot"]).json()["id"])

    response = client_for(world["ana"]).post(cancel_url(reservation), {}, format="json")

    assert response.status_code == 200, response.json()
    assert response.json()["status"] == "CANCELLED"
    assert response.json()["cancelled_by"] == {
        "id": str(world["ana"].pk),
        "full_name": "Ana Pérez",
    }
    world["slot"].refresh_from_db()
    assert world["slot"].status == SlotStatus.AVAILABLE


def test_t_04_13_ca_hu04_2_late_cancellation_is_recorded_as_no_show(
    world: dict[str, Any],
) -> None:
    slot = make_slot(
        world["sofia"],
        world["calculo"],
        world["term"],
        timezone.now() + timedelta(hours=3),
        status=SlotStatus.RESERVED,
    )
    reservation = make_reservation(slot, world["ana"])

    response = client_for(world["ana"]).post(cancel_url(reservation), {}, format="json")

    assert response.status_code == 200
    assert response.json()["status"] == "NO_SHOW"
    slot.refresh_from_db()
    assert slot.status == SlotStatus.AVAILABLE


def test_t_04_14_ca_hu04_3_another_student_gets_403(world: dict[str, Any]) -> None:
    reservation = make_reservation(world["slot"], world["ana"])

    response = client_for(world["luis"]).post(cancel_url(reservation), {}, format="json")

    assert response.status_code == 403
    reservation.refresh_from_db()
    assert reservation.status == ReservationStatus.CONFIRMED


def test_t_04_15_ca_hu04_4_cancelling_twice_is_409(world: dict[str, Any]) -> None:
    reservation = make_reservation(world["slot"], world["ana"])
    client = client_for(world["ana"])
    client.post(cancel_url(reservation), {}, format="json")

    response = client.post(cancel_url(reservation), {}, format="json")

    assert response.status_code == 409
    assert response.json()["type"] == "already_cancelled"


def test_t_04_15_cancelling_a_no_show_is_409_not_active(world: dict[str, Any]) -> None:
    reservation = make_reservation(world["slot"], world["ana"], status=ReservationStatus.NO_SHOW)

    response = client_for(world["ana"]).post(cancel_url(reservation), {}, format="json")

    assert response.status_code == 409
    assert response.json()["type"] == "not_active"
    assert response.json()["detail"] == "La reserva ya no está activa."


def test_t_04_16_monitor_must_justify_and_is_recorded(world: dict[str, Any]) -> None:
    reservation = make_reservation(world["slot"], world["ana"])
    client = client_for(world["sofia"])

    missing = client.post(cancel_url(reservation), {}, format="json")
    response = client.post(cancel_url(reservation), {"reason": "Calamidad"}, format="json")

    assert missing.status_code == 400
    assert "reason" in missing.json()["errors"]
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "CANCELLED"
    assert data["cancellation_reason"] == "Calamidad"
    assert data["cancelled_by"]["id"] == str(world["sofia"].pk)


def test_reason_longer_than_the_limit_is_400(world: dict[str, Any]) -> None:
    reservation = make_reservation(world["slot"], world["ana"])

    response = client_for(world["sofia"]).post(
        cancel_url(reservation), {"reason": "x" * 501}, format="json"
    )

    assert response.status_code == 400


def test_cancelling_an_unknown_reservation_is_404(world: dict[str, Any]) -> None:
    response = client_for(world["ana"]).post(
        f"{RESERVATIONS_URL}00000000-0000-4000-8000-000000000000/cancel/", {}, format="json"
    )

    assert response.status_code == 404


# --- GET /reservations/mine/?role= (traceability for a user with both roles) ----------------


@pytest.fixture
def dual(world: dict[str, Any]) -> dict[str, Any]:
    """Sofía monitors Cálculo and, as a student, books Andrés's Mecánica slot."""
    sofia = world["sofia"]
    sofia.user_roles.create(role=Role.objects.get(code=Role.Code.STUDENT))
    andres, mecanica, term = make_assigned_monitor(
        "andres@unal.edu.co", make_subject("FIS-201", "Mecánica"), world["term"]
    )
    as_monitor = make_reservation(world["slot"], world["ana"])
    as_student = make_reservation(make_slot(andres, mecanica, term, SLOT_START + 3 * HOUR), sofia)
    return {**world, "as_monitor": as_monitor, "as_student": as_student}


def mine_ids(user: User, **params: str) -> list[str]:
    response = client_for(user).get(MINE_URL, params)
    assert response.status_code == 200, response.json()
    return [item["id"] for item in response.json()["results"]]


def test_mine_role_student_lists_only_what_the_user_booked(dual: dict[str, Any]) -> None:
    assert mine_ids(dual["sofia"], role="student") == [str(dual["as_student"].pk)]


def test_mine_role_monitor_lists_only_reservations_on_the_users_slots(
    dual: dict[str, Any],
) -> None:
    assert mine_ids(dual["sofia"], role="monitor") == [str(dual["as_monitor"].pk)]


def test_mine_without_role_keeps_both_sides(dual: dict[str, Any]) -> None:
    assert set(mine_ids(dual["sofia"])) == {
        str(dual["as_monitor"].pk),
        str(dual["as_student"].pk),
    }


def test_mine_empty_role_counts_as_omitted_like_the_other_filters(dual: dict[str, Any]) -> None:
    assert len(mine_ids(dual["sofia"], role="")) == 2


def test_mine_role_combines_with_the_other_filters(dual: dict[str, Any]) -> None:
    assert mine_ids(dual["sofia"], role="student", when="upcoming", status="CONFIRMED") == [
        str(dual["as_student"].pk)
    ]
    assert mine_ids(dual["sofia"], role="student", status="CANCELLED") == []


@pytest.mark.parametrize("role", ["teacher", "STUDENT", "admin", "both"])
def test_mine_invalid_role_is_400(dual: dict[str, Any], role: str) -> None:
    response = client_for(dual["sofia"]).get(MINE_URL, {"role": role})

    assert response.status_code == 400
    assert "role" in response.json()["errors"]


def test_mine_items_name_the_other_side(dual: dict[str, Any]) -> None:
    client = client_for(dual["sofia"])

    as_monitor = client.get(MINE_URL, {"role": "monitor"}).json()["results"][0]
    as_student = client.get(MINE_URL, {"role": "student"}).json()["results"][0]

    assert as_monitor["student"]["full_name"] == "Ana Pérez"
    assert as_student["slot"]["monitor"]["id"] == str(
        User.objects.get(email="andres@unal.edu.co").pk
    )


@pytest.mark.parametrize("role", ["student", "monitor"])
def test_mine_by_role_runs_a_fixed_number_of_queries(world: dict[str, Any], role: str) -> None:
    sofia = world["sofia"]
    sofia.user_roles.create(role=Role.objects.get(code=Role.Code.STUDENT))
    andres, mecanica, term = make_assigned_monitor(
        "andres@unal.edu.co", make_subject("FIS-201", "Mecánica"), world["term"]
    )
    for week in range(1, 6):
        start = SLOT_START + timedelta(days=7 * week)
        make_reservation(make_slot(andres, mecanica, term, start), sofia)
        make_reservation(
            make_slot(sofia, world["calculo"], world["term"], start + 2 * HOUR), world["ana"]
        )
    client = client_for(sofia)

    with CaptureQueriesContext(connection) as few:
        client.get(MINE_URL, {"role": role, "page_size": "1"})
    with CaptureQueriesContext(connection) as many:
        response = client.get(MINE_URL, {"role": role, "page_size": "5"})

    assert response.json()["count"] == 5
    assert len(many) == len(few)


# --- Optional student note (RF-047) ---------------------------------------------------------


def test_rf_047_note_is_stored_trimmed_and_returned(world: dict[str, Any]) -> None:
    response = reserve(world["ana"], world["slot"], note="  Quiero repasar derivadas.  ")

    assert response.status_code == 201, response.json()
    assert response.json()["student_note"] == "Quiero repasar derivadas."
    assert Reservation.objects.get().student_note == "Quiero repasar derivadas."


@pytest.mark.parametrize("body", [{}, {"note": ""}, {"note": "   "}])
def test_rf_047_note_is_optional_and_blank_is_empty(
    world: dict[str, Any], body: dict[str, Any]
) -> None:
    response = reserve(world["ana"], world["slot"], **body)

    assert response.status_code == 201
    assert response.json()["student_note"] == ""


def test_rf_047_note_longer_than_500_is_400(world: dict[str, Any]) -> None:
    response = reserve(world["ana"], world["slot"], note="x" * 501)

    assert response.status_code == 400
    assert "note" in response.json()["errors"]
    assert not Reservation.objects.exists()


def test_rf_047_note_of_exactly_500_is_accepted(world: dict[str, Any]) -> None:
    assert reserve(world["ana"], world["slot"], note="x" * 500).status_code == 201


def test_rf_047_monitor_and_admin_see_the_note(world: dict[str, Any]) -> None:
    reservation = make_reservation(world["slot"], world["ana"], student_note="Traigo dudas")
    admin = make_user("admin@unal.edu.co", Role.Code.ADMIN)

    for reader in (world["sofia"], admin):
        assert client_for(reader).get(detail_url(reservation)).json()["student_note"] == (
            "Traigo dudas"
        )
    assert client_for(world["sofia"]).get(MINE_URL).json()["results"][0]["student_note"] == (
        "Traigo dudas"
    )


def test_rf_047_another_student_of_the_same_group_slot_never_sees_the_note(
    world: dict[str, Any],
) -> None:
    group = make_slot(
        world["sofia"], world["calculo"], world["term"], SLOT_START + 3 * HOUR, capacity=3
    )
    ana_reservation = make_reservation(group, world["ana"], student_note="Nota privada de Ana")
    make_reservation(group, world["luis"])
    luis = client_for(world["luis"])

    detail = luis.get(detail_url(ana_reservation))
    mine = luis.get(MINE_URL).json()
    search = luis.get("/api/v1/availability-slots/search/").json()
    monitor_slots = client_for(world["sofia"]).get("/api/v1/availability-slots/mine/").json()

    assert detail.status_code == 403
    assert "Nota privada de Ana" not in str(detail.json())
    assert [item["id"] for item in mine["results"]] != [str(ana_reservation.pk)]
    assert "Nota privada de Ana" not in str(mine)
    assert "Nota privada de Ana" not in str(search)
    assert "Nota privada de Ana" not in str(monitor_slots)


def test_rf_047_note_is_immutable_cancel_keeps_it_and_there_is_no_edit(
    world: dict[str, Any],
) -> None:
    reservation = make_reservation(world["slot"], world["ana"], student_note="Original")
    client = client_for(world["ana"])

    assert (
        client.patch(detail_url(reservation), {"student_note": "Otra"}, format="json").status_code
        == 405
    )
    assert (
        client.put(detail_url(reservation), {"student_note": "Otra"}, format="json").status_code
        == 405
    )
    cancelled = client.post(cancel_url(reservation), {"note": "Otra"}, format="json")

    assert cancelled.json()["student_note"] == "Original"
    reservation.refresh_from_db()
    assert reservation.student_note == "Original"
