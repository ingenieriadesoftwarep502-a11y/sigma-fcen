"""Tutoring sessions and topics HTTP API (FASE-05 §4.3).

CA-HU06-1 to CA-HU06-5, CA-HU12-1 to CA-HU12-4, RN-006.6, RN-006.8, RN-006.9, SAD §6.3.
"""

from datetime import datetime, timedelta
from typing import Any

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.reservations.domain.rules import ReservationStatus
from apps.reservations.models import Reservation
from apps.tutoring_sessions.domain.rules import AttendanceStatus
from apps.tutoring_sessions.models import Topic, TutoringSession
from tests.availability_data import SLOT_START, make_assigned_monitor, make_slot
from tests.catalog_data import (
    client_for,
    make_assignment,
    make_course,
    make_subject,
    make_user,
)
from tests.material_data import make_document
from tests.reservation_data import make_reservation, make_student
from tests.session_data import make_attendance, make_session, make_started_slot, make_topic

pytestmark = pytest.mark.django_db

SESSIONS_URL = "/api/v1/tutoring-sessions/"
MINE_URL = "/api/v1/tutoring-sessions/mine/"
HISTORY_URL = "/api/v1/tutoring-sessions/history/"
TOPICS_URL = "/api/v1/topics/"
PROBLEM_KEYS = {"type", "title", "status", "detail", "instance"}


def detail_url(session: TutoringSession | str) -> str:
    pk = session.pk if isinstance(session, TutoringSession) else session
    return f"{SESSIONS_URL}{pk}/"


@pytest.fixture
def world() -> dict[str, Any]:
    sofia, calculo, term = make_assigned_monitor("sofia.diaz@unal.edu.co")
    sofia.first_name, sofia.last_name = "Sofía", "Díaz"
    sofia.save()
    slot = make_started_slot(sofia, calculo, term, capacity=3)
    ana = make_student("ana.perez@unal.edu.co", first_name="Ana", last_name="Pérez")
    luis = make_student("luis.gomez@unal.edu.co", first_name="Luis", last_name="Gómez")
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


def body(world: dict[str, Any], **overrides: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "slot_id": world["slot"].pk,
        "attendance": [
            {"reservation_id": str(world["ana_reservation"].pk), "attendance": "ATTENDED"},
            {"reservation_id": str(world["luis_reservation"].pk), "attendance": "NO_SHOW"},
        ],
        "topic_ids": [str(world["cadena"].pk)],
        "notes": "Repasamos la regla de la cadena.",
    }
    data.update(overrides)
    return data


def post_session(user: User, data: dict[str, Any]) -> Any:
    return client_for(user).post(SESSIONS_URL, data, format="json")


def recorded(world: dict[str, Any]) -> TutoringSession:
    response = post_session(world["sofia"], body(world))
    assert response.status_code == 201, response.json()
    return TutoringSession.objects.get(pk=response.json()["id"])


# --- POST /tutoring-sessions/ (HU-06) ---------------------------------------------------------


def test_rnf_sec_sessions_require_authentication(world: dict[str, Any]) -> None:
    response = APIClient().post(SESSIONS_URL, body(world), format="json")

    assert response.status_code == 401


def test_t_05_5_ca_hu06_1_monitor_records_the_session(world: dict[str, Any]) -> None:
    response = post_session(world["sofia"], body(world))

    assert response.status_code == 201, response.json()
    data = response.json()
    assert data["slot"]["id"] == world["slot"].pk
    assert data["slot"]["subject"]["id"] == world["calculo"].pk
    assert data["topics"] == [{"id": str(world["cadena"].pk), "name": "Regla de la cadena"}]
    assert data["notes"] == "Repasamos la regla de la cadena."
    assert data["duration_minutes"] == 60
    assert {(row["student"]["full_name"], row["attendance"]) for row in data["attendance"]} == {
        ("Ana Pérez", "ATTENDED"),
        ("Luis Gómez", "NO_SHOW"),
    }
    recorded_at = datetime.fromisoformat(data["recorded_at"])
    editable_until = datetime.fromisoformat(data["editable_until"])
    assert editable_until - recorded_at == timedelta(hours=48)


def test_t_05_8_ca_hu06_4_reservations_take_the_recorded_outcome(world: dict[str, Any]) -> None:
    post_session(world["sofia"], body(world))

    world["ana_reservation"].refresh_from_db()
    world["luis_reservation"].refresh_from_db()
    assert world["ana_reservation"].status == ReservationStatus.COMPLETED
    assert world["luis_reservation"].status == ReservationStatus.NO_SHOW


def test_t_05_5_material_of_the_subject_can_be_referenced(world: dict[str, Any]) -> None:
    taller = make_document(world["calculo"], world["sofia"], "Taller 3")

    response = post_session(world["sofia"], body(world, material_ids=[str(taller.pk)]))

    assert response.status_code == 201, response.json()
    assert response.json()["materials"] == [
        {"id": str(taller.pk), "title": "Taller 3", "kind": "DOCUMENT"}
    ]


def test_t_05_4_ca_hu06_2_future_slot_is_400_in_the_sad_format(world: dict[str, Any]) -> None:
    future = make_slot(world["sofia"], world["calculo"], world["term"], SLOT_START)
    reservation = make_reservation(future, world["ana"])

    response = post_session(
        world["sofia"],
        body(
            world,
            slot_id=future.pk,
            attendance=[{"reservation_id": str(reservation.pk), "attendance": "ATTENDED"}],
        ),
    )

    assert response.status_code == 400
    data = response.json()
    assert data.keys() >= PROBLEM_KEYS
    assert data["errors"]["slot_id"] == [
        "La monitoría aún no ha comenzado; regístrala cuando empiece."
    ]


def test_t_05_6_ca_hu06_3_second_session_is_409(world: dict[str, Any]) -> None:
    recorded(world)

    response = post_session(world["sofia"], body(world))

    assert response.status_code == 409
    assert response.json()["type"] == "already_recorded"
    assert TutoringSession.objects.count() == 1


def test_t_05_9_ca_hu06_5_another_monitor_gets_403(world: dict[str, Any]) -> None:
    andres, _, _ = make_assigned_monitor("andres@unal.edu.co", world["calculo"], world["term"])

    response = post_session(andres, body(world))

    assert response.status_code == 403
    assert response.json().keys() >= PROBLEM_KEYS
    assert not TutoringSession.objects.exists()


def test_t_05_9_a_student_cannot_record_a_session(world: dict[str, Any]) -> None:
    response = post_session(world["ana"], body(world))

    assert response.status_code == 403


def test_t_05_18_missing_reservation_is_400_on_attendance(world: dict[str, Any]) -> None:
    response = post_session(world["sofia"], body(world, attendance=body(world)["attendance"][:1]))

    assert response.status_code == 400
    assert "attendance" in response.json()["errors"]


def test_t_05_20_attended_session_without_topics_is_400(world: dict[str, Any]) -> None:
    response = post_session(world["sofia"], body(world, topic_ids=[]))

    assert response.status_code == 400
    assert "topic_ids" in response.json()["errors"]


def test_unknown_attendance_value_is_400(world: dict[str, Any]) -> None:
    data = body(world)
    data["attendance"][0]["attendance"] = "LATE"

    response = post_session(world["sofia"], data)

    assert response.status_code == 400


def test_recorder_is_never_taken_from_the_body(world: dict[str, Any]) -> None:
    andres = make_user("andres@unal.edu.co", Role.Code.MONITOR)

    response = post_session(world["sofia"], body(world, recorded_by=str(andres.pk)))

    assert response.status_code == 201
    assert TutoringSession.objects.get().recorded_by == world["sofia"]


# --- GET /tutoring-sessions/{id}/ (RN-006.9) ---------------------------------------------------


def test_slot_monitor_reads_the_whole_session(world: dict[str, Any]) -> None:
    session = recorded(world)

    response = client_for(world["sofia"]).get(detail_url(session))

    assert response.status_code == 200
    assert response.json()["notes"] == "Repasamos la regla de la cadena."
    assert len(response.json()["attendance"]) == 2


def test_rn_006_9_student_sees_only_their_attendance_and_no_notes(world: dict[str, Any]) -> None:
    session = recorded(world)

    response = client_for(world["ana"]).get(detail_url(session))

    assert response.status_code == 200
    data = response.json()
    assert data["notes"] is None
    assert [(row["student"]["full_name"], row["attendance"]) for row in data["attendance"]] == [
        ("Ana Pérez", "ATTENDED")
    ]
    assert data["topics"][0]["name"] == "Regla de la cadena"


def test_teacher_of_the_course_reads_the_whole_session(world: dict[str, Any]) -> None:
    teacher = make_user("docente@unal.edu.co", Role.Code.TEACHER)
    make_course(world["calculo"], world["term"], teacher=teacher)
    session = recorded(world)

    response = client_for(teacher).get(detail_url(session))

    assert response.status_code == 200
    assert response.json()["notes"] == "Repasamos la regla de la cadena."


def test_administrator_reads_the_whole_session(world: dict[str, Any]) -> None:
    session = recorded(world)
    admin = make_user("admin@unal.edu.co", Role.Code.ADMIN)

    response = client_for(admin).get(detail_url(session))

    assert response.status_code == 200
    assert len(response.json()["attendance"]) == 2


def test_an_outsider_gets_403_and_a_missing_session_404(world: dict[str, Any]) -> None:
    session = recorded(world)
    outsider = make_student("eva@unal.edu.co")
    teacher_elsewhere = make_user("otro.docente@unal.edu.co", Role.Code.TEACHER)
    make_course(make_subject("1000003", "Álgebra Lineal"), world["term"], teacher=teacher_elsewhere)

    assert client_for(outsider).get(detail_url(session)).status_code == 403
    assert client_for(teacher_elsewhere).get(detail_url(session)).status_code == 403
    missing = client_for(world["sofia"]).get(detail_url("00000000-0000-0000-0000-000000000000"))
    assert missing.status_code == 404


# --- PATCH /tutoring-sessions/{id}/ (RN-006.6, RN-006.8, RF-052) -------------------------------


def patch(user: User, session: TutoringSession, data: dict[str, Any]) -> Any:
    return client_for(user).patch(detail_url(session), data, format="json")


def test_t_05_10_monitor_corrects_the_session_inside_the_window(world: dict[str, Any]) -> None:
    session = recorded(world)
    limites = make_topic(world["calculo"], "Límites")

    response = patch(
        world["sofia"],
        session,
        {"topic_ids": [str(limites.pk)], "notes": "Corregido", "duration_minutes": 50},
    )

    assert response.status_code == 200, response.json()
    data = response.json()
    assert [topic["name"] for topic in data["topics"]] == ["Límites"]
    assert data["notes"] == "Corregido"
    assert data["duration_minutes"] == 50


def test_t_05_10_rn_006_8_attendance_cannot_be_edited(world: dict[str, Any]) -> None:
    session = recorded(world)

    response = patch(
        world["sofia"],
        session,
        {
            "attendance": [
                {"reservation_id": str(world["luis_reservation"].pk), "attendance": "ATTENDED"}
            ]
        },
    )

    assert response.status_code == 400
    assert response.json()["errors"]["attendance"] == [
        "La asistencia no se puede editar después de registrar la sesión."
    ]
    world["luis_reservation"].refresh_from_db()
    assert world["luis_reservation"].status == ReservationStatus.NO_SHOW


def test_t_05_10_rn_006_6_after_48_hours_the_patch_is_409(world: dict[str, Any]) -> None:
    session = make_session(world["slot"], recorded_at=timezone.now() - timedelta(hours=49))

    response = patch(world["sofia"], session, {"notes": "Tarde"})

    assert response.status_code == 409
    assert response.json()["type"] == "edit_window_closed"


def test_t_05_10_another_user_cannot_patch(world: dict[str, Any]) -> None:
    session = recorded(world)

    assert patch(world["ana"], session, {"notes": "x"}).status_code == 403


# --- GET /tutoring-sessions/mine/ ---------------------------------------------------------------


def test_monitor_lists_their_sessions_latest_first(world: dict[str, Any]) -> None:
    older_slot = make_started_slot(world["sofia"], world["calculo"], world["term"], hours_ago=30)
    older = make_session(older_slot, recorded_at=timezone.now() - timedelta(hours=28))
    newer = recorded(world)
    andres, algebra, term = make_assigned_monitor("andres@unal.edu.co", make_subject("1000003"))
    make_session(make_started_slot(andres, algebra, term))

    response = client_for(world["sofia"]).get(MINE_URL)

    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 2
    assert [item["id"] for item in data["results"]] == [str(newer.pk), str(older.pk)]


def test_monitor_filters_their_sessions_by_subject(world: dict[str, Any]) -> None:
    recorded(world)
    algebra = make_subject("1000003", "Álgebra Lineal")
    make_assignment(world["sofia"], algebra, world["term"])
    make_session(make_started_slot(world["sofia"], algebra, world["term"], hours_ago=5))

    response = client_for(world["sofia"]).get(MINE_URL, {"subject": algebra.pk})

    assert response.json()["count"] == 1
    assert response.json()["results"][0]["slot"]["subject"]["id"] == algebra.pk


def test_t_05_15_monitor_listing_has_no_n_plus_one(world: dict[str, Any]) -> None:
    recorded(world)
    for hours_ago in (5, 8, 11):
        slot = make_started_slot(world["sofia"], world["calculo"], world["term"], hours_ago)
        session = make_session(slot)
        session.topics.set([world["cadena"]])
        make_attendance(session, make_reservation(slot, world["ana"]))
    client = client_for(world["sofia"])

    with CaptureQueriesContext(connection) as queries:
        response = client.get(MINE_URL)

    assert response.json()["count"] == 4
    assert len(queries) <= 5, [query["sql"] for query in queries]


# --- GET /tutoring-sessions/history/ (HU-12) ----------------------------------------------------


def test_t_05_11_ca_hu12_1_history_shows_subject_date_monitor_and_evaluation(
    world: dict[str, Any],
) -> None:
    recorded(world)

    response = client_for(world["ana"]).get(HISTORY_URL)

    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 1
    item = data["results"][0]
    assert item["id"] == str(world["ana_reservation"].pk)
    assert item["status"] == "COMPLETED"
    assert item["slot"]["subject"]["name"] == world["calculo"].name
    assert item["slot"]["monitor"]["full_name"] == "Sofía Díaz"
    assert item["slot"]["starts_at"]
    assert item["session"]["topics"] == [
        {"id": str(world["cadena"].pk), "name": "Regla de la cadena"}
    ]
    assert "notes" not in item["session"]
    assert item["evaluation"] is None  # FASE-06


def test_t_05_11_history_includes_no_shows_and_late_cancellations(world: dict[str, Any]) -> None:
    recorded(world)
    other = make_started_slot(world["sofia"], world["calculo"], world["term"], hours_ago=30)
    make_reservation(other, world["luis"], status=ReservationStatus.NO_SHOW)  # late cancellation
    make_reservation(other, world["ana"], status=ReservationStatus.CANCELLED)

    response = client_for(world["luis"]).get(HISTORY_URL)

    items = response.json()["results"]
    assert [(item["status"], item["session"] is None) for item in items] == [
        ("NO_SHOW", False),
        ("NO_SHOW", True),
    ]


def test_t_05_11_history_excludes_upcoming_and_cancelled_reservations(
    world: dict[str, Any],
) -> None:
    future = make_slot(world["sofia"], world["calculo"], world["term"], SLOT_START)
    make_reservation(future, world["ana"])

    response = client_for(world["ana"]).get(HISTORY_URL)

    assert response.json()["count"] == 0


def test_t_05_11_history_filters_by_status_and_subject(world: dict[str, Any]) -> None:
    recorded(world)

    completed = client_for(world["ana"]).get(HISTORY_URL, {"status": "COMPLETED"})
    no_show = client_for(world["ana"]).get(HISTORY_URL, {"status": "NO_SHOW"})
    other_subject = client_for(world["ana"]).get(
        HISTORY_URL, {"subject": make_subject("1000003").pk}
    )

    assert completed.json()["count"] == 1
    assert no_show.json()["count"] == 0
    assert other_subject.json()["count"] == 0


def test_t_05_11_history_rejects_a_status_that_is_not_closed(world: dict[str, Any]) -> None:
    response = client_for(world["ana"]).get(HISTORY_URL, {"status": "CONFIRMED"})

    assert response.status_code == 400


def test_t_05_12_ca_hu12_2_empty_history_is_200_with_an_empty_list(world: dict[str, Any]) -> None:
    response = client_for(make_student("nuevo@unal.edu.co")).get(HISTORY_URL)

    assert response.status_code == 200
    assert response.json()["count"] == 0
    assert response.json()["results"] == []


def test_t_05_13_ca_hu12_3_another_students_history_is_403(world: dict[str, Any]) -> None:
    recorded(world)

    response = client_for(world["luis"]).get(HISTORY_URL, {"student": str(world["ana"].pk)})

    assert response.status_code == 403
    assert response.json().keys() >= PROBLEM_KEYS


def test_t_05_13_own_id_and_administrator_may_name_the_student(world: dict[str, Any]) -> None:
    recorded(world)
    admin = make_user("admin@unal.edu.co", Role.Code.ADMIN)

    own = client_for(world["ana"]).get(HISTORY_URL, {"student": str(world["ana"].pk)})
    by_admin = client_for(admin).get(HISTORY_URL, {"student": str(world["ana"].pk)})

    assert own.json()["count"] == 1
    assert by_admin.json()["count"] == 1


def test_t_05_14_ca_hu12_4_long_history_is_paginated(world: dict[str, Any]) -> None:
    for hours_ago in range(3, 3 + 25):
        slot = make_started_slot(world["sofia"], world["calculo"], world["term"], hours_ago)
        make_reservation(slot, world["ana"], status=ReservationStatus.NO_SHOW)

    first = client_for(world["ana"]).get(HISTORY_URL)
    second = client_for(world["ana"]).get(HISTORY_URL, {"page": 2})

    assert first.json()["count"] == 25
    assert len(first.json()["results"]) == 20
    assert first.json()["next"] is not None
    assert len(second.json()["results"]) == 5


def test_t_05_15_history_has_no_n_plus_one(world: dict[str, Any]) -> None:
    recorded(world)
    for hours_ago in (5, 8, 11, 14):
        slot = make_started_slot(world["sofia"], world["calculo"], world["term"], hours_ago)
        reservation = make_reservation(slot, world["ana"])
        session = make_session(slot)
        session.topics.set([world["cadena"]])
        make_attendance(session, reservation, AttendanceStatus.ATTENDED)
        Reservation.objects.filter(pk=reservation.pk).update(status=ReservationStatus.COMPLETED)
    client = client_for(world["ana"])

    with CaptureQueriesContext(connection) as queries:
        response = client.get(HISTORY_URL)

    assert response.json()["count"] == 5
    assert len(queries) <= 3, [query["sql"] for query in queries]


# --- /topics/ (T-05.21) ---------------------------------------------------------------------------


def test_t_05_21_topics_of_a_subject_are_listed_by_name(world: dict[str, Any]) -> None:
    make_topic(world["calculo"], "Límites")
    make_topic(make_subject("1000003", "Álgebra Lineal"), "Matrices")

    response = client_for(world["ana"]).get(TOPICS_URL, {"subject": world["calculo"].pk})

    assert response.status_code == 200
    assert [topic["name"] for topic in response.json()] == ["Límites", "Regla de la cadena"]


def test_t_05_21_topic_listing_requires_the_subject(world: dict[str, Any]) -> None:
    response = client_for(world["ana"]).get(TOPICS_URL)

    assert response.status_code == 400
    assert "subject" in response.json()["errors"]


def test_t_05_21_monitor_creates_a_topic_201_and_repeating_it_is_200(world: dict[str, Any]) -> None:
    client = client_for(world["sofia"])
    data = {"subject_id": world["calculo"].pk, "name": "Integrales dobles"}

    created = client.post(TOPICS_URL, data, format="json")
    repeated = client.post(TOPICS_URL, {**data, "name": "integrales  DOBLES"}, format="json")

    assert created.status_code == 201, created.json()
    assert repeated.status_code == 200
    assert repeated.json()["id"] == created.json()["id"]
    assert Topic.objects.filter(subject=world["calculo"]).count() == 2


def test_t_05_21_student_cannot_create_topics(world: dict[str, Any]) -> None:
    response = client_for(world["ana"]).post(
        TOPICS_URL, {"subject_id": world["calculo"].pk, "name": "Series"}, format="json"
    )

    assert response.status_code == 403


def test_t_05_21_blank_topic_name_is_400(world: dict[str, Any]) -> None:
    response = client_for(world["sofia"]).post(
        TOPICS_URL, {"subject_id": world["calculo"].pk, "name": "   "}, format="json"
    )

    assert response.status_code == 400
    assert "name" in response.json()["errors"]
