"""Availability HTTP API: monitor slots, weekly templates and student search (FASE-03 §4.2).

CA-HU05-1 to CA-HU05-5, CA-HU02-1 to CA-HU02-6, T-03.8 to T-03.15.
"""

from datetime import UTC, time, timedelta
from typing import Any

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role
from apps.availability.domain.rules import LOCAL_TZ, SlotStatus
from apps.availability.models import AvailabilitySlot, SlotTemplate
from tests.availability_data import (
    HOUR,
    SLOT_START,
    current_term,
    local_datetime,
    make_assigned_monitor,
    make_slot,
    next_weekday,
)
from tests.catalog_data import client_for, make_subject, make_user

pytestmark = pytest.mark.django_db

SLOTS_URL = "/api/v1/availability-slots/"
MINE_URL = "/api/v1/availability-slots/mine/"
SEARCH_URL = "/api/v1/availability-slots/search/"
TEMPLATES_URL = "/api/v1/slot-templates/"
TEMPLATES_MINE_URL = "/api/v1/slot-templates/mine/"


def slot_url(pk: int) -> str:
    return f"{SLOTS_URL}{pk}/"


def body(**overrides: Any) -> dict[str, Any]:
    data = {
        "starts_at": SLOT_START.isoformat(),
        "modality": "IN_PERSON",
        "location": "Edificio 404, aula 201",
    }
    return {**data, **overrides}


@pytest.fixture
def world() -> dict[str, Any]:
    term = current_term()
    calculo = make_subject("MAT-101", "Cálculo Diferencial")
    mecanica = make_subject("FIS-201", "Mecánica")
    sofia, _, _ = make_assigned_monitor("sofia.diaz@unal.edu.co", calculo, term)
    andres, _, _ = make_assigned_monitor("andres.mora@unal.edu.co", mecanica, term)
    student = make_user("ana.perez@unal.edu.co", Role.Code.STUDENT)
    return {
        "term": term,
        "calculo": calculo,
        "mecanica": mecanica,
        "sofia": sofia,
        "andres": andres,
        "student": student,
    }


# --- POST /availability-slots/ ---------------------------------------------------------------


def test_ca_hu05_1_monitor_publishes_a_slot(world: dict[str, Any]) -> None:
    response = client_for(world["sofia"]).post(
        SLOTS_URL, body(subject=world["calculo"].pk, capacity=2), format="json"
    )

    assert response.status_code == 201, response.json()
    data = response.json()
    assert data["subject"] == {
        "id": world["calculo"].pk,
        "code": "MAT-101",
        "name": "Cálculo Diferencial",
    }
    assert data["term"] == world["term"].code
    assert data["status"] == "AVAILABLE"
    assert data["capacity"] == 2
    assert data["template"] is None
    slot = AvailabilitySlot.objects.get(pk=data["id"])
    assert slot.ends_at - slot.starts_at == HOUR


def test_t_03_15_rnf_dat_001_times_are_stored_and_returned_in_utc(world: dict[str, Any]) -> None:
    local = SLOT_START.astimezone(LOCAL_TZ).isoformat()  # ...T10:00:00-05:00

    response = client_for(world["sofia"]).post(
        SLOTS_URL, body(subject=world["calculo"].pk, starts_at=local), format="json"
    )

    assert response.status_code == 201
    assert response.json()["starts_at"] == SLOT_START.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    slot = AvailabilitySlot.objects.get()
    assert slot.starts_at.utcoffset() == timedelta(0)


def test_ca_hu05_2_overlapping_slot_is_rejected(world: dict[str, Any]) -> None:
    client = client_for(world["sofia"])
    client.post(SLOTS_URL, body(subject=world["calculo"].pk), format="json")

    later = (SLOT_START + timedelta(minutes=30)).isoformat()
    response = client.post(
        SLOTS_URL, body(subject=world["calculo"].pk, starts_at=later), format="json"
    )

    assert response.status_code == 400
    assert response.json() == {"starts_at": ["Se solapa con otra franja tuya."]}


def test_t_03_6_ca_hu05_5_unassigned_subject_is_forbidden(world: dict[str, Any]) -> None:
    response = client_for(world["sofia"]).post(
        SLOTS_URL, body(subject=world["mecanica"].pk), format="json"
    )

    assert response.status_code == 403
    assert "No tienes asignada" in response.json()["detail"]


@pytest.mark.parametrize(
    ("override", "field"),
    [
        ({"location": ""}, "location"),
        ({"modality": "HYBRID"}, "modality"),
        ({"capacity": 0}, "capacity"),
        ({"starts_at": "mañana"}, "starts_at"),
        ({"subject": 999999}, "subject"),
    ],
)
def test_invalid_input_is_a_400_on_its_field(
    world: dict[str, Any], override: dict[str, Any], field: str
) -> None:
    data = {**body(subject=world["calculo"].pk), **override}

    response = client_for(world["sofia"]).post(SLOTS_URL, data, format="json")

    assert response.status_code == 400
    assert field in response.json()


def test_slot_in_the_past_is_a_400(world: dict[str, Any]) -> None:
    past = (SLOT_START - timedelta(days=14)).isoformat()

    response = client_for(world["sofia"]).post(
        SLOTS_URL, body(subject=world["calculo"].pk, starts_at=past), format="json"
    )

    assert response.status_code == 400
    assert response.json() == {"starts_at": ["La franja no puede empezar en el pasado."]}


# --- Roles and authentication ------------------------------------------------------------------


MONITOR_ONLY = [
    ("post", SLOTS_URL),
    ("get", MINE_URL),
    ("post", TEMPLATES_URL),
    ("get", TEMPLATES_MINE_URL),
]


@pytest.mark.parametrize(("method", "url"), [*MONITOR_ONLY, ("get", SEARCH_URL)])
def test_ca_hu02_6_anonymous_requests_get_401(method: str, url: str) -> None:
    assert getattr(APIClient(), method)(url, {}, format="json").status_code == 401


@pytest.mark.parametrize(("method", "url"), MONITOR_ONLY)
@pytest.mark.parametrize("role", [Role.Code.STUDENT, Role.Code.TEACHER, Role.Code.ADMIN])
def test_rnf_sec_004_monitor_endpoints_reject_other_roles(
    world: dict[str, Any], method: str, url: str, role: str
) -> None:
    user = make_user(f"{role.lower()}@unal.edu.co", role)

    assert getattr(client_for(user), method)(url, {}, format="json").status_code == 403


# --- GET /availability-slots/mine/ -------------------------------------------------------------


def test_mine_lists_only_the_monitors_own_slots_in_date_order(world: dict[str, Any]) -> None:
    owner = (world["sofia"], world["calculo"], world["term"])
    later = make_slot(*owner, SLOT_START + 2 * HOUR)
    first = make_slot(*owner)
    make_slot(world["andres"], world["mecanica"], world["term"])

    response = client_for(world["sofia"]).get(MINE_URL)

    assert response.status_code == 200
    assert [s["id"] for s in response.json()["results"]] == [first.pk, later.pk]


def test_mine_filters_by_status_and_dates(world: dict[str, Any]) -> None:
    owner = (world["sofia"], world["calculo"], world["term"])
    tuesday = make_slot(*owner)
    thursday_start = local_datetime(next_weekday(3, SLOT_START.date()), time(8, 0))
    make_slot(*owner, thursday_start, status=SlotStatus.CANCELLED)
    client = client_for(world["sofia"])

    by_status = client.get(MINE_URL, {"status": "AVAILABLE"}).json()["results"]
    thursday = thursday_start.date().isoformat()
    by_date = client.get(MINE_URL, {"date_from": thursday, "date_to": thursday}).json()["results"]

    assert [s["id"] for s in by_status] == [tuesday.pk]
    assert [s["status"] for s in by_date] == ["CANCELLED"]


# --- PATCH and DELETE /availability-slots/{id}/ ----------------------------------------------


def test_patch_moves_the_slot(world: dict[str, Any]) -> None:
    slot = make_slot(world["sofia"], world["calculo"], world["term"])
    moved = SLOT_START + 2 * HOUR

    response = client_for(world["sofia"]).patch(
        slot_url(slot.pk), {"starts_at": moved.isoformat(), "modality": "VIRTUAL"}, format="json"
    )

    assert response.status_code == 200, response.json()
    slot.refresh_from_db()
    assert slot.starts_at == moved
    assert slot.ends_at == moved + HOUR
    assert slot.modality == "VIRTUAL"


def test_rn_003_4_patch_on_a_reserved_slot_is_409(world: dict[str, Any]) -> None:
    slot = make_slot(world["sofia"], world["calculo"], world["term"], status=SlotStatus.RESERVED)

    response = client_for(world["sofia"]).patch(
        slot_url(slot.pk), {"location": "Otra aula"}, format="json"
    )

    assert response.status_code == 409
    assert "reserva" in response.json()["detail"]


def test_t_03_7_ca_hu05_3_delete_withdraws_the_slot(world: dict[str, Any]) -> None:
    slot = make_slot(world["sofia"], world["calculo"], world["term"])

    response = client_for(world["sofia"]).delete(slot_url(slot.pk))

    assert response.status_code == 204
    slot.refresh_from_db()
    assert slot.status == SlotStatus.CANCELLED


def test_t_03_7_ca_hu05_4_delete_on_a_reserved_slot_is_409(world: dict[str, Any]) -> None:
    slot = make_slot(world["sofia"], world["calculo"], world["term"], status=SlotStatus.RESERVED)

    response = client_for(world["sofia"]).delete(slot_url(slot.pk))

    assert response.status_code == 409
    slot.refresh_from_db()
    assert slot.status == SlotStatus.RESERVED


@pytest.mark.parametrize("method", ["patch", "delete"])
def test_another_monitors_slot_is_404(world: dict[str, Any], method: str) -> None:
    slot = make_slot(world["andres"], world["mecanica"], world["term"])

    response = getattr(client_for(world["sofia"]), method)(
        slot_url(slot.pk), {"location": "x"}, format="json"
    )

    assert response.status_code == 404
    slot.refresh_from_db()
    assert slot.status == SlotStatus.AVAILABLE
    # The route exists: its owner reaches the same slot.
    owner = client_for(world["andres"]).patch(slot_url(slot.pk), {"location": "x"}, format="json")
    assert owner.status_code == 200


# --- GET /availability-slots/search/ ---------------------------------------------------------


@pytest.fixture
def listed(world: dict[str, Any]) -> dict[str, Any]:
    """Three bookable slots plus four that the search must hide."""
    sofia = (world["sofia"], world["calculo"], world["term"])
    andres = (world["andres"], world["mecanica"], world["term"])
    thursday = local_datetime(next_weekday(3, SLOT_START.date()), time(14, 0))
    yesterday = local_datetime(timezone.localdate(timezone=LOCAL_TZ) - timedelta(days=1), time(8))
    shown = {
        "calculo_tuesday": make_slot(*sofia),
        "calculo_thursday": make_slot(*sofia, thursday, modality="VIRTUAL", location="Meet"),
        "mecanica_tuesday": make_slot(*andres, SLOT_START + HOUR),
    }
    hidden = [
        make_slot(*sofia, SLOT_START + 2 * HOUR, status=SlotStatus.RESERVED),
        make_slot(*sofia, SLOT_START + 3 * HOUR, status=SlotStatus.CANCELLED),
        make_slot(*andres, SLOT_START + 3 * HOUR, status=SlotStatus.EXPIRED),
        make_slot(*sofia, yesterday),
    ]
    return {**world, **shown, "hidden": hidden, "thursday": thursday}


def search(user: Any, **params: Any) -> list[int]:
    response = client_for(user).get(SEARCH_URL, params)
    assert response.status_code == 200, response.json()
    return [slot["id"] for slot in response.json()["results"]]


def test_t_03_8_ca_hu02_1_search_shows_only_available_future_slots(listed: dict[str, Any]) -> None:
    ids = search(listed["student"])

    assert ids == [
        listed["calculo_tuesday"].pk,
        listed["mecanica_tuesday"].pk,
        listed["calculo_thursday"].pk,
    ]


def test_search_result_carries_what_the_student_needs(listed: dict[str, Any]) -> None:
    result = client_for(listed["student"]).get(SEARCH_URL, {"subject": listed["calculo"].pk})

    first = result.json()["results"][0]
    assert first["monitor"] == {
        "id": str(listed["sofia"].pk),
        "full_name": f"{listed['sofia'].first_name} {listed['sofia'].last_name}",
    }
    assert first["subject"]["code"] == "MAT-101"
    assert first["location"] == "Edificio 404, aula 201"


def test_t_03_9_ca_hu02_2_filter_by_subject(listed: dict[str, Any]) -> None:
    ids = search(listed["student"], subject=listed["mecanica"].pk)

    assert ids == [listed["mecanica_tuesday"].pk]


def test_t_03_10_ca_hu02_3_filter_by_date_range(listed: dict[str, Any]) -> None:
    day = listed["thursday"].date()

    assert search(listed["student"], date_from=day) == [listed["calculo_thursday"].pk]
    assert search(listed["student"], date_to=SLOT_START.date()) == [
        listed["calculo_tuesday"].pk,
        listed["mecanica_tuesday"].pk,
    ]


def test_t_03_11_ca_hu02_4_filter_by_monitor(listed: dict[str, Any]) -> None:
    ids = search(listed["student"], monitor=listed["sofia"].pk)

    assert ids == [listed["calculo_tuesday"].pk, listed["calculo_thursday"].pk]


def test_filter_by_modality(listed: dict[str, Any]) -> None:
    assert search(listed["student"], modality="VIRTUAL") == [listed["calculo_thursday"].pk]


def test_t_03_12_ca_hu02_5_no_results_is_an_empty_200(listed: dict[str, Any]) -> None:
    other = make_subject("QUI-101", "Química General")

    assert search(listed["student"], subject=other.pk) == []


def test_deactivated_monitors_slots_are_hidden(listed: dict[str, Any]) -> None:
    listed["andres"].is_active = False
    listed["andres"].save()

    assert listed["mecanica_tuesday"].pk not in search(listed["student"])


@pytest.mark.parametrize(
    "params",
    [
        {"date_from": "2026-13-01"},
        {"date_from": "2026-10-20", "date_to": "2026-10-19"},
        {"modality": "HYBRID"},
        {"monitor": "no-es-un-uuid"},
    ],
)
def test_invalid_search_filters_are_a_400(world: dict[str, Any], params: dict[str, str]) -> None:
    response = client_for(world["student"]).get(SEARCH_URL, params)

    assert response.status_code == 400


def test_t_03_14_rnf_per_001_search_runs_a_fixed_number_of_queries(world: dict[str, Any]) -> None:
    client = client_for(world["student"])

    def count_queries() -> int:
        with CaptureQueriesContext(connection) as queries:
            assert client.get(SEARCH_URL).status_code == 200
        return len(queries)

    make_slot(world["sofia"], world["calculo"], world["term"])
    one = count_queries()
    for hours in range(1, 6):
        make_slot(world["sofia"], world["calculo"], world["term"], SLOT_START + hours * HOUR)
        make_slot(world["andres"], world["mecanica"], world["term"], SLOT_START + hours * HOUR)

    assert count_queries() == one


# --- Weekly templates ----------------------------------------------------------------------------


def template_body(world: dict[str, Any], **overrides: Any) -> dict[str, Any]:
    data = {
        "subject": world["calculo"].pk,
        "term": world["term"].code,
        "weekday": 1,
        "start_time": "10:00",
        "modality": "IN_PERSON",
        "location": "Edificio 404, aula 201",
    }
    return {**data, **overrides}


def test_template_is_created_with_its_slots(world: dict[str, Any]) -> None:
    response = client_for(world["sofia"]).post(TEMPLATES_URL, template_body(world), format="json")

    assert response.status_code == 201, response.json()
    data = response.json()
    template = SlotTemplate.objects.get(pk=data["id"])
    assert data["slots_created"] == template.slots.count() > 0
    assert data["is_active"] is True
    assert data["start_time"] == "10:00:00"


def test_template_with_conflicts_is_a_400_listing_the_dates(world: dict[str, Any]) -> None:
    clash = local_datetime(next_weekday(1), time(10, 30))
    make_slot(world["sofia"], world["calculo"], world["term"], clash)

    response = client_for(world["sofia"]).post(TEMPLATES_URL, template_body(world), format="json")

    assert response.status_code == 400
    assert response.json()["conflicts"] == [clash.date().isoformat()]
    assert SlotTemplate.objects.count() == 0


def test_template_on_an_unassigned_subject_is_403(world: dict[str, Any]) -> None:
    response = client_for(world["sofia"]).post(
        TEMPLATES_URL, template_body(world, subject=world["mecanica"].pk), format="json"
    )

    assert response.status_code == 403


def test_templates_mine_and_delete(world: dict[str, Any]) -> None:
    client = client_for(world["sofia"])
    created = client.post(TEMPLATES_URL, template_body(world), format="json").json()

    listed = client.get(TEMPLATES_MINE_URL).json()["results"]
    deleted = client.delete(f"{TEMPLATES_URL}{created['id']}/")

    assert [t["id"] for t in listed] == [created["id"]]
    assert deleted.status_code == 204
    template = SlotTemplate.objects.get(pk=created["id"])
    assert not template.is_active
    assert not template.slots.filter(status=SlotStatus.AVAILABLE).exists()


def test_another_monitors_template_is_404(world: dict[str, Any]) -> None:
    created = (
        client_for(world["sofia"]).post(TEMPLATES_URL, template_body(world), format="json").json()
    )

    response = client_for(world["andres"]).delete(f"{TEMPLATES_URL}{created['id']}/")

    assert response.status_code == 404
