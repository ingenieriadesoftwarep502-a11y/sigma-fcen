"""Evaluations HTTP API (FASE-06 §4): CA-HU07-1 to CA-HU07-5, RN-007, RF-060 to RF-063.

Confirmed 2026-11-10: scale 1 to 5, average published from the 2nd evaluation, and
evaluations anonymous to the monitor (RF-062): no response a monitor or another student can
read names the author of an individual evaluation.
"""

import json
from typing import Any
from uuid import uuid4

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.evaluations.models import Evaluation
from apps.reservations.domain.rules import ReservationStatus
from apps.tutoring_sessions.domain.rules import AttendanceStatus
from apps.tutoring_sessions.models import TutoringSession
from tests.availability_data import make_assigned_monitor
from tests.catalog_data import client_for, make_user
from tests.evaluation_data import attend, make_evaluation
from tests.reservation_data import make_reservation, make_student
from tests.session_data import make_session, make_started_slot, make_topic

pytestmark = pytest.mark.django_db

EVALUATIONS_URL = "/api/v1/evaluations/"
MINE_URL = "/api/v1/evaluations/mine/"
PENDING_URL = "/api/v1/tutoring-sessions/pending-evaluation/"
HISTORY_URL = "/api/v1/tutoring-sessions/history/"
SESSIONS_MINE_URL = "/api/v1/tutoring-sessions/mine/"
PROBLEM_KEYS = {"type", "title", "status", "detail", "instance"}
EVALUATION_KEYS = {"id", "session_id", "slot", "rating", "comment", "created_at"}
RATING_KEYS = {"monitor", "published", "average", "evaluation_count", "minimum_evaluations"}


def rating_url(monitor: User | str) -> str:
    pk = monitor.pk if isinstance(monitor, User) else monitor
    return f"/api/v1/monitors/{pk}/rating/"


def session_url(session: TutoringSession) -> str:
    return f"/api/v1/tutoring-sessions/{session.pk}/"


@pytest.fixture
def world() -> dict[str, Any]:
    sofia, calculo, term = make_assigned_monitor("sofia.diaz@unal.edu.co")
    sofia.first_name, sofia.last_name = "Sofía", "Díaz"
    sofia.save()
    slot = make_started_slot(sofia, calculo, term, capacity=3)
    session = make_session(slot)
    session.topics.set([make_topic(calculo)])
    ana = make_student("ana.perez@unal.edu.co", first_name="Ana", last_name="Pérez")
    luis = make_student("luis.gomez@unal.edu.co", first_name="Luis", last_name="Gómez")
    return {
        "sofia": sofia,
        "calculo": calculo,
        "term": term,
        "slot": slot,
        "session": session,
        "ana": ana,
        "luis": luis,
        "ana_reservation": attend(session, make_reservation(slot, ana)),
        "luis_reservation": attend(session, make_reservation(slot, luis), AttendanceStatus.NO_SHOW),
    }


def body(world: dict[str, Any], **overrides: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "session_id": str(world["session"].pk),
        "rating": 5,
        "comment": "Explica con mucha claridad.",
    }
    data.update(overrides)
    return data


def post(user: User, data: dict[str, Any]) -> Any:
    return client_for(user).post(EVALUATIONS_URL, data, format="json")


def identity_markers(*students: User) -> list[str]:
    """Every way a response could name a student: id, email, first and last name."""
    markers: list[str] = []
    for student in students:
        markers += [str(student.pk), student.email, student.first_name, student.last_name]
    return markers


def another_attended_session(world: dict[str, Any], hours_ago: int, email: str) -> Any:
    slot = make_started_slot(world["sofia"], world["calculo"], world["term"], hours_ago)
    session = make_session(slot)
    student = make_student(email, first_name="Marta", last_name="Ríos")
    attend(session, make_reservation(slot, student))
    return session, student


# --- POST /evaluations/ ------------------------------------------------------------------------


def test_rnf_sec_evaluating_requires_authentication(world: dict[str, Any]) -> None:
    response = APIClient().post(EVALUATIONS_URL, body(world), format="json")

    assert response.status_code == 401


def test_t_06_3_ca_hu07_1_a_student_evaluates_a_session_they_attended(
    world: dict[str, Any],
) -> None:
    response = post(world["ana"], body(world, rating=4))

    assert response.status_code == 201, response.json()
    data = response.json()
    assert set(data) == EVALUATION_KEYS
    assert data["session_id"] == str(world["session"].pk)
    assert data["slot"]["id"] == world["slot"].pk
    assert data["slot"]["monitor"]["full_name"] == "Sofía Díaz"
    assert data["rating"] == 4
    assert data["comment"] == "Explica con mucha claridad."
    evaluation = Evaluation.objects.get()
    assert (evaluation.student, evaluation.rating) == (world["ana"], 4)


def test_t_06_3_the_comment_is_optional(world: dict[str, Any]) -> None:
    data = body(world)
    del data["comment"]

    response = post(world["ana"], data)

    assert response.status_code == 201, response.json()
    assert response.json()["comment"] == ""


@pytest.mark.parametrize("rating", [0, 6, -3, 10, "cinco", None, 4.5])
def test_t_06_2_ca_hu07_4_a_rating_outside_the_scale_is_400(
    world: dict[str, Any], rating: Any
) -> None:
    response = post(world["ana"], body(world, rating=rating))

    assert response.status_code == 400
    data = response.json()
    assert data.keys() >= PROBLEM_KEYS
    assert "rating" in data["errors"]
    assert not Evaluation.objects.exists()


def test_t_06_2_the_rating_is_required(world: dict[str, Any]) -> None:
    data = body(world)
    del data["rating"]

    response = post(world["ana"], data)

    assert response.status_code == 400
    assert "rating" in response.json()["errors"]


def test_t_06_2_a_comment_over_500_characters_is_400(world: dict[str, Any]) -> None:
    response = post(world["ana"], body(world, comment="a" * 501))

    assert response.status_code == 400
    assert "comment" in response.json()["errors"]


def test_an_unknown_session_is_400(world: dict[str, Any]) -> None:
    response = post(world["ana"], body(world, session_id=str(uuid4())))

    assert response.status_code == 400
    assert "session_id" in response.json()["errors"]


def test_t_06_4_ca_hu07_2_evaluating_twice_is_409(world: dict[str, Any]) -> None:
    post(world["ana"], body(world))

    response = post(world["ana"], body(world, rating=1))

    assert response.status_code == 409
    assert response.json()["type"] == "already_evaluated"
    assert response.json().keys() >= PROBLEM_KEYS
    assert Evaluation.objects.get().rating == 5


def test_t_06_5_ca_hu07_3_a_session_of_other_students_is_403(world: dict[str, Any]) -> None:
    outsider = make_student("otro@unal.edu.co")

    response = post(outsider, body(world))

    assert response.status_code == 403
    assert response.json().keys() >= PROBLEM_KEYS
    assert not Evaluation.objects.exists()


def test_t_06_5_the_monitor_cannot_evaluate_their_session(world: dict[str, Any]) -> None:
    response = post(world["sofia"], body(world))

    assert response.status_code == 403


def test_t_06_6_ca_hu07_5_a_no_show_cannot_evaluate(world: dict[str, Any]) -> None:
    response = post(world["luis"], body(world))

    assert response.status_code == 400
    assert "session_id" in response.json()["errors"]
    assert not Evaluation.objects.exists()


# --- GET /evaluations/mine/ ----------------------------------------------------------------------


def test_mine_lists_only_the_students_own_evaluations(world: dict[str, Any]) -> None:
    post(world["ana"], body(world, rating=4))
    other_session, marta = another_attended_session(world, 6, "marta@unal.edu.co")
    make_evaluation(other_session, marta, 2)

    response = client_for(world["ana"]).get(MINE_URL)

    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 1
    item = data["results"][0]
    assert set(item) == EVALUATION_KEYS
    assert (item["session_id"], item["rating"]) == (str(world["session"].pk), 4)


def test_mine_requires_authentication() -> None:
    assert APIClient().get(MINE_URL).status_code == 401


# --- GET /monitors/{id}/rating/ -----------------------------------------------------------------


def test_rating_requires_authentication(world: dict[str, Any]) -> None:
    assert APIClient().get(rating_url(world["sofia"])).status_code == 401


def test_rating_of_an_unknown_user_or_a_non_monitor_is_404(world: dict[str, Any]) -> None:
    client = client_for(world["ana"])

    assert client.get(rating_url(str(uuid4()))).status_code == 404
    assert client.get(rating_url(world["ana"])).status_code == 404


def test_t_06_8_rn_007_5_below_two_evaluations_there_is_not_enough_data(
    world: dict[str, Any],
) -> None:
    make_evaluation(world["session"], world["ana"], 5)

    for viewer in (world["ana"], world["sofia"]):
        response = client_for(viewer).get(rating_url(world["sofia"]))

        assert response.status_code == 200
        data = response.json()
        assert set(data) == RATING_KEYS
        assert data["monitor"] == {"id": str(world["sofia"].pk), "full_name": "Sofía Díaz"}
        assert data["published"] is False
        assert data["average"] is None
        assert data["evaluation_count"] is None
        assert data["minimum_evaluations"] == 2


def test_t_06_7_t_06_8_from_two_evaluations_the_average_is_published(
    world: dict[str, Any],
) -> None:
    make_evaluation(world["session"], world["ana"], 5)
    other_session, marta = another_attended_session(world, 6, "marta@unal.edu.co")
    make_evaluation(other_session, marta, 2)

    response = client_for(world["luis"]).get(rating_url(world["sofia"]))

    data = response.json()
    assert data["published"] is True
    assert data["average"] == 3.5
    assert data["evaluation_count"] == 2


# --- T-06.9 · RF-062: the author of an evaluation never reaches the monitor ----------------------


def test_t_06_9_rf_062_the_rating_never_names_an_author(world: dict[str, Any]) -> None:
    make_evaluation(world["session"], world["ana"], 5, comment="Comentario de Ana")
    other_session, marta = another_attended_session(world, 6, "marta@unal.edu.co")
    make_evaluation(other_session, marta, 3, comment="Comentario de Marta")

    response = client_for(world["sofia"]).get(rating_url(world["sofia"]))

    raw = json.dumps(response.json(), ensure_ascii=False)
    for marker in identity_markers(world["ana"], marta):
        assert marker not in raw
    assert "Comentario de" not in raw  # comments are not shown to the monitor either
    assert "student" not in raw


def test_t_06_9_rf_062_the_monitors_session_views_carry_no_evaluation(
    world: dict[str, Any],
) -> None:
    make_evaluation(world["session"], world["ana"], 1, comment="Comentario de Ana")
    client = client_for(world["sofia"])

    detail = json.dumps(client.get(session_url(world["session"])).json(), ensure_ascii=False)
    listing = json.dumps(client.get(SESSIONS_MINE_URL).json(), ensure_ascii=False)

    for raw in (detail, listing):
        assert "evaluation" not in raw
        assert "rating" not in raw
        assert "Comentario de Ana" not in raw


def test_t_06_9_rf_062_the_monitor_cannot_read_evaluations_through_the_student_endpoints(
    world: dict[str, Any],
) -> None:
    make_evaluation(world["session"], world["ana"], 1, comment="Comentario de Ana")
    client = client_for(world["sofia"])

    mine = client.get(MINE_URL)
    history = client.get(HISTORY_URL, {"student": str(world["ana"].pk)})
    pending = client.get(PENDING_URL)

    assert mine.json()["count"] == 0
    assert history.status_code == 403
    assert pending.json()["count"] == 0


def test_t_06_9_a_student_never_reads_another_students_evaluation(world: dict[str, Any]) -> None:
    other_session, marta = another_attended_session(world, 6, "marta@unal.edu.co")
    make_evaluation(other_session, marta, 2, comment="Comentario de Marta")
    make_evaluation(world["session"], world["ana"], 5)

    for url in (MINE_URL, HISTORY_URL, PENDING_URL):
        raw = json.dumps(client_for(world["ana"]).get(url).json(), ensure_ascii=False)
        assert "Comentario de Marta" not in raw
        for marker in identity_markers(marta):
            assert marker not in raw


# --- T-06.10 · GET /tutoring-sessions/pending-evaluation/ ----------------------------------------


def test_t_06_10_pending_lists_the_attended_sessions_without_evaluation(
    world: dict[str, Any],
) -> None:
    response = client_for(world["ana"]).get(PENDING_URL)

    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 1
    item = data["results"][0]
    assert item["id"] == str(world["ana_reservation"].pk)
    assert item["status"] == "COMPLETED"
    assert item["session"]["id"] == str(world["session"].pk)
    assert item["evaluation"] is None


def test_t_06_10_evaluated_and_missed_sessions_are_not_pending(world: dict[str, Any]) -> None:
    post(world["ana"], body(world))

    assert client_for(world["ana"]).get(PENDING_URL).json()["count"] == 0
    assert client_for(world["luis"]).get(PENDING_URL).json()["count"] == 0


def test_t_06_10_pending_excludes_late_cancellations(world: dict[str, Any]) -> None:
    other = make_started_slot(world["sofia"], world["calculo"], world["term"], hours_ago=30)
    make_reservation(other, world["ana"], status=ReservationStatus.NO_SHOW)

    assert client_for(world["ana"]).get(PENDING_URL).json()["count"] == 1


def test_t_06_10_pending_requires_authentication() -> None:
    assert APIClient().get(PENDING_URL).status_code == 401


def test_t_06_10_pending_has_no_n_plus_one(world: dict[str, Any]) -> None:
    for hours_ago in (5, 8, 11, 14):
        slot = make_started_slot(world["sofia"], world["calculo"], world["term"], hours_ago)
        session = make_session(slot)
        attend(session, make_reservation(slot, world["ana"]))
    client = client_for(world["ana"])

    with CaptureQueriesContext(connection) as queries:
        response = client.get(PENDING_URL)

    assert response.json()["count"] == 5
    assert len(queries) <= 4, [query["sql"] for query in queries]


# --- The student's history now carries their evaluation (CA-HU12-1) ------------------------------


def test_history_shows_the_students_own_evaluation(world: dict[str, Any]) -> None:
    post(world["ana"], body(world, rating=4, comment="Muy útil."))

    response = client_for(world["ana"]).get(HISTORY_URL)

    evaluation = response.json()["results"][0]["evaluation"]
    assert set(evaluation) == {"id", "rating", "comment", "created_at"}
    assert (evaluation["rating"], evaluation["comment"]) == (4, "Muy útil.")


def test_history_does_not_show_another_participants_evaluation(world: dict[str, Any]) -> None:
    """Group slot: Ana's evaluation of the session never appears in Luis's history."""
    post(world["ana"], body(world))

    response = client_for(world["luis"]).get(HISTORY_URL)

    assert response.json()["results"][0]["evaluation"] is None


def test_an_administrator_reads_a_students_history_with_their_evaluation(
    world: dict[str, Any],
) -> None:
    post(world["ana"], body(world, rating=3))
    admin = make_user("admin@unal.edu.co", Role.Code.ADMIN)

    response = client_for(admin).get(HISTORY_URL, {"student": str(world["ana"].pk)})

    assert response.json()["results"][0]["evaluation"]["rating"] == 3
