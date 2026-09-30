"""The requesting monitor's own assignments and their teachers (RN-002, RN-009.1)."""

from typing import Any

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.accounts.models import Role
from tests.catalog_data import (
    client_for,
    make_assignment,
    make_course,
    make_current_and_previous_terms,
    make_department,
    make_subject,
    make_user,
)

pytestmark = pytest.mark.django_db

MINE_URL = "/api/v1/monitor-assignments/mine/"


@pytest.fixture
def catalog() -> dict[str, Any]:
    current, previous = make_current_and_previous_terms()
    mat = make_department("MAT", "Matemáticas")
    fis = make_department("FIS", "Física")
    calculo = make_subject("MAT-101", "Cálculo Diferencial", department=mat, credits=4)
    mecanica = make_subject("FIS-201", "Mecánica", department=fis, credits=3)
    laura = make_user(
        "laura.gomez@unal.edu.co", Role.Code.TEACHER, first_name="Laura", last_name="Gómez"
    )
    pedro = make_user(
        "pedro.ruiz@unal.edu.co", Role.Code.TEACHER, first_name="Pedro", last_name="Ruiz"
    )
    sofia = make_user(
        "sofia.diaz@unal.edu.co", Role.Code.MONITOR, first_name="Sofía", last_name="Díaz"
    )
    andres = make_user(
        "andres.mora@unal.edu.co", Role.Code.MONITOR, first_name="Andrés", last_name="Mora"
    )
    # Current term: Cálculo G1 (Laura), G2 (Pedro), G3 (no teacher); Mecánica G1 (Pedro).
    # Previous term: Mecánica G1 (Laura).
    make_course(calculo, current, "1", laura)
    make_course(calculo, current, "2", pedro)
    make_course(calculo, current, "3", None)
    make_course(mecanica, current, "1", pedro)
    make_course(mecanica, previous, "1", laura)
    return {
        "current": current,
        "calculo": calculo,
        "mecanica": mecanica,
        "laura": laura,
        "pedro": pedro,
        "sofia": sofia,
        "andres": andres,
        "mine": make_assignment(sofia, calculo, current, committed_hours=6),
        "mine_old": make_assignment(sofia, mecanica, previous, committed_hours=2),
        "foreign": make_assignment(andres, mecanica, current, committed_hours=4),
    }


def test_monitor_sees_only_their_assignments_with_the_subject_teachers(
    catalog: dict[str, Any],
) -> None:
    response = client_for(catalog["sofia"]).get(MINE_URL)

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    laura, pedro, calculo = catalog["laura"], catalog["pedro"], catalog["calculo"]
    assert body["results"] == [
        {
            "id": catalog["mine"].pk,
            "subject": {
                "id": calculo.pk,
                "code": "MAT-101",
                "name": "Cálculo Diferencial",
                "credits": 4,
                "department": {"id": calculo.department_id, "code": "MAT", "name": "Matemáticas"},
            },
            "term": "2026-2",
            "committed_hours": 6,
            "teachers": [
                {
                    "id": str(laura.pk),
                    "full_name": "Laura Gómez",
                    "email": "laura.gomez@unal.edu.co",
                    "group": "1",
                },
                {
                    "id": str(pedro.pk),
                    "full_name": "Pedro Ruiz",
                    "email": "pedro.ruiz@unal.edu.co",
                    "group": "2",
                },
            ],
        }
    ]


def test_another_monitors_assignments_never_appear(catalog: dict[str, Any]) -> None:
    for term in ("2026-2", "2026-1"):
        response = client_for(catalog["sofia"]).get(MINE_URL, {"term": term})
        ids = [a["id"] for a in response.json()["results"]]
        assert catalog["foreign"].pk not in ids

    response = client_for(catalog["andres"]).get(MINE_URL)
    assert [a["id"] for a in response.json()["results"]] == [catalog["foreign"].pk]
    assert [t["email"] for t in response.json()["results"][0]["teachers"]] == [
        "pedro.ruiz@unal.edu.co"
    ]


def test_monitor_switches_term_and_sees_that_terms_teachers(catalog: dict[str, Any]) -> None:
    response = client_for(catalog["sofia"]).get(MINE_URL, {"term": "2026-1"})

    results = response.json()["results"]
    assert [(a["subject"]["code"], a["term"], a["committed_hours"]) for a in results] == [
        ("FIS-201", "2026-1", 2)
    ]
    assert [(t["email"], t["group"]) for t in results[0]["teachers"]] == [
        ("laura.gomez@unal.edu.co", "1")
    ]


def test_student_monitor_reaches_their_assignments(catalog: dict[str, Any]) -> None:
    both = make_user("doble@unal.edu.co", Role.Code.STUDENT, Role.Code.MONITOR)
    make_assignment(both, catalog["mecanica"], catalog["current"], committed_hours=3)

    response = client_for(both).get(MINE_URL)

    assert response.status_code == 200
    assert [a["subject"]["code"] for a in response.json()["results"]] == ["FIS-201"]


def test_monitor_without_assignments_gets_an_empty_page(catalog: dict[str, Any]) -> None:
    lonely = make_user("sin.asignar@unal.edu.co", Role.Code.MONITOR)

    response = client_for(lonely).get(MINE_URL)

    assert response.status_code == 200
    assert response.json()["count"] == 0
    assert response.json()["results"] == []


def test_monitor_assignments_reject_unknown_term(catalog: dict[str, Any]) -> None:
    assert client_for(catalog["sofia"]).get(MINE_URL, {"term": "2030-2"}).status_code == 400


def test_monitor_assignments_are_empty_without_terms() -> None:
    monitor = make_user("monitor@unal.edu.co", Role.Code.MONITOR)

    response = client_for(monitor).get(MINE_URL)

    assert response.status_code == 200
    assert response.json()["results"] == []


def test_monitor_assignment_list_query_count_does_not_grow_with_rows(
    catalog: dict[str, Any],
) -> None:
    client = client_for(catalog["sofia"])
    with CaptureQueriesContext(connection) as few:
        client.get(MINE_URL)
    for number in range(3, 8):
        subject = make_subject(f"MAT-{number}00", f"Asignatura {number}")
        teacher = make_user(f"docente{number}@unal.edu.co", Role.Code.TEACHER)
        make_course(subject, catalog["current"], "1", teacher)
        make_course(subject, catalog["current"], "2", teacher)
        make_assignment(catalog["sofia"], subject, catalog["current"])

    with CaptureQueriesContext(connection) as many:
        response = client.get(MINE_URL)

    assert response.json()["count"] == 6
    assert len(many) == len(few)
