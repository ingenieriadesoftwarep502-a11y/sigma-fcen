"""Courses, the teacher's own courses and the catalog summary (T-02.3, T-02.8, RF-024, RN-009.1)."""

from typing import Any
from unittest import mock

import pytest
from django.db import IntegrityError, connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from apps.academics.models import Course
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

COURSES_URL = "/api/v1/courses/"
MINE_URL = "/api/v1/courses/mine/"
SUMMARY_URL = "/api/v1/catalog/summary/"


@pytest.fixture
def admin_client() -> APIClient:
    return client_for(make_user("admin@unal.edu.co", Role.Code.ADMIN))


@pytest.fixture
def catalog() -> dict[str, Any]:
    current, previous = make_current_and_previous_terms()
    mat = make_department("MAT", "Matemáticas")
    fis = make_department("FIS", "Física")
    calculo = make_subject("MAT-101", "Cálculo Diferencial", department=mat)
    mecanica = make_subject("FIS-201", "Mecánica", department=fis)
    teacher = make_user(
        "laura.gomez@unal.edu.co", Role.Code.TEACHER, first_name="Laura", last_name="Gómez"
    )
    other_teacher = make_user(
        "pedro.ruiz@unal.edu.co", Role.Code.TEACHER, first_name="Pedro", last_name="Ruiz"
    )
    monitor = make_user(
        "sofia.diaz@unal.edu.co", Role.Code.MONITOR, first_name="Sofía", last_name="Díaz"
    )
    old_monitor = make_user("antiguo@unal.edu.co", Role.Code.MONITOR)
    return {
        "current": current,
        "previous": previous,
        "mat": mat,
        "calculo": calculo,
        "mecanica": mecanica,
        "teacher": teacher,
        "other_teacher": other_teacher,
        "monitor": monitor,
        "old_monitor": old_monitor,
        # Current term: Cálculo G1 (Laura, one monitor), Cálculo G2 (no teacher),
        # Mecánica G1 (Pedro, no monitors). Previous term: Mecánica G1 (Laura).
        "calculo_1": make_course(calculo, current, "1", teacher),
        "calculo_2": make_course(calculo, current, "2", None),
        "mecanica_1": make_course(mecanica, current, "1", other_teacher),
        "mecanica_old": make_course(mecanica, previous, "1", teacher),
        "assignment": make_assignment(monitor, calculo, current, committed_hours=6),
        "old_assignment": make_assignment(old_monitor, mecanica, previous, committed_hours=4),
    }


def _labels(response: Any) -> list[str]:
    return [f"{c['subject']['code']}/{c['group']}" for c in response.json()["results"]]


# --- Create and edit -----------------------------------------------------------------------


def test_rf_024_admin_creates_course_with_teacher(
    admin_client: APIClient, catalog: dict[str, Any]
) -> None:
    teacher = catalog["teacher"]

    response = admin_client.post(
        COURSES_URL,
        {"subject": catalog["mecanica"].pk, "term": "2026-2", "group": "a", "teacher": teacher.pk},
        format="json",
    )

    assert response.status_code == 201
    body = response.json()
    assert body == {
        "id": body["id"],
        "subject": {
            "id": catalog["mecanica"].pk,
            "code": "FIS-201",
            "name": "Mecánica",
            "credits": 4,
            "department": {
                "id": catalog["mecanica"].department_id,
                "code": "FIS",
                "name": "Física",
            },
        },
        "term": "2026-2",
        "group": "A",
        "teacher": {"id": str(teacher.pk), "full_name": "Laura Gómez", "email": teacher.email},
        "monitor_count": 0,
    }


def test_rf_024_admin_creates_course_without_teacher(
    admin_client: APIClient, catalog: dict[str, Any]
) -> None:
    response = admin_client.post(
        COURSES_URL, {"subject": catalog["mecanica"].pk, "term": "2026-2", "group": "3"}
    )

    assert response.status_code == 201
    assert response.json()["teacher"] is None


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"teacher": "monitor"}, "teacher"),
        ({"term": "2030-1"}, "term"),
        ({"group": "G 1"}, "group"),
        ({"group": "1"}, "non_field_errors"),
    ],
)
def test_t_02_3_invalid_or_duplicate_course_is_rejected(
    admin_client: APIClient, catalog: dict[str, Any], overrides: dict[str, Any], field: str
) -> None:
    if overrides.get("teacher") == "monitor":
        overrides = {"teacher": str(catalog["monitor"].pk)}
    payload = {"subject": catalog["calculo"].pk, "term": "2026-2", "group": "9"}

    response = admin_client.post(COURSES_URL, {**payload, **overrides}, format="json")

    assert response.status_code == 400
    assert field in response.json()
    assert Course.objects.count() == 4


def test_t_02_3_duplicate_course_message(admin_client: APIClient, catalog: dict[str, Any]) -> None:
    response = admin_client.post(
        COURSES_URL,
        {"subject": catalog["calculo"].pk, "term": "2026-2", "group": "1"},
        format="json",
    )

    assert response.json()["non_field_errors"] == [
        "Ya existe un curso de esta asignatura con ese grupo en el período."
    ]


def test_rf_024_admin_assigns_and_removes_the_teacher(
    admin_client: APIClient, catalog: dict[str, Any]
) -> None:
    url = f"{COURSES_URL}{catalog['calculo_2'].pk}/"

    assigned = admin_client.patch(url, {"teacher": str(catalog["teacher"].pk)}, format="json")
    removed = admin_client.patch(url, {"teacher": None}, format="json")

    assert assigned.status_code == 200
    assert assigned.json()["teacher"]["email"] == "laura.gomez@unal.edu.co"
    assert removed.status_code == 200
    assert removed.json()["teacher"] is None


def test_rf_024_patching_a_non_teacher_as_teacher_fails(
    admin_client: APIClient, catalog: dict[str, Any]
) -> None:
    url = f"{COURSES_URL}{catalog['calculo_1'].pk}/"

    response = admin_client.patch(url, {"teacher": str(catalog["monitor"].pk)}, format="json")

    assert response.status_code == 400
    assert response.json() == {"teacher": ["El usuario no tiene el rol Docente."]}


def test_admin_reads_one_course(admin_client: APIClient, catalog: dict[str, Any]) -> None:
    response = admin_client.get(f"{COURSES_URL}{catalog['calculo_1'].pk}/")

    assert response.status_code == 200
    assert response.json()["monitor_count"] == 1


# --- Listing -------------------------------------------------------------------------------


def test_courses_default_to_the_current_term(
    admin_client: APIClient, catalog: dict[str, Any]
) -> None:
    response = admin_client.get(COURSES_URL)

    assert response.status_code == 200
    assert _labels(response) == ["MAT-101/1", "MAT-101/2", "FIS-201/1"]
    assert [c["monitor_count"] for c in response.json()["results"]] == [1, 1, 0]


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({"term": "2026-1"}, ["FIS-201/1"]),
        ({"department": "mat"}, ["MAT-101/1", "MAT-101/2"]),
        ({"search": "gómez"}, ["MAT-101/1"]),
        ({"search": "laura gómez"}, ["MAT-101/1"]),
        ({"search": "pedro.ruiz@"}, ["FIS-201/1"]),
        ({"search": "mecán"}, ["FIS-201/1"]),
        ({"without_teacher": "true"}, ["MAT-101/2"]),
        ({"without_teacher": "false"}, ["MAT-101/1", "FIS-201/1"]),
        ({"without_monitors": "true"}, ["FIS-201/1"]),
        ({"without_monitors": "false"}, ["MAT-101/1", "MAT-101/2"]),
        ({"ordering": "code"}, ["FIS-201/1", "MAT-101/1", "MAT-101/2"]),
        ({"ordering": "-monitor_count"}, ["MAT-101/1", "MAT-101/2", "FIS-201/1"]),
    ],
)
def test_course_filters(
    admin_client: APIClient,
    catalog: dict[str, Any],
    params: dict[str, str],
    expected: list[str],
) -> None:
    assert _labels(admin_client.get(COURSES_URL, params)) == expected


def test_courses_filter_by_department_id(admin_client: APIClient, catalog: dict[str, Any]) -> None:
    response = admin_client.get(COURSES_URL, {"department": catalog["mat"].pk})

    assert _labels(response) == ["MAT-101/1", "MAT-101/2"]


@pytest.mark.parametrize(
    "params", [{"term": "1999-1"}, {"without_teacher": "si"}, {"ordering": "teacher"}]
)
def test_invalid_course_query_parameters_return_400(
    admin_client: APIClient, catalog: dict[str, Any], params: dict[str, str]
) -> None:
    assert admin_client.get(COURSES_URL, params).status_code == 400


def test_courses_are_empty_without_terms(admin_client: APIClient) -> None:
    response = admin_client.get(COURSES_URL)

    assert response.status_code == 200
    assert response.json()["count"] == 0


def test_course_list_query_count_does_not_grow_with_rows(
    admin_client: APIClient, catalog: dict[str, Any]
) -> None:
    with CaptureQueriesContext(connection) as few:
        admin_client.get(COURSES_URL)
    for group in range(3, 13):
        make_course(catalog["calculo"], catalog["current"], str(group), catalog["other_teacher"])

    with CaptureQueriesContext(connection) as many:
        response = admin_client.get(COURSES_URL)

    assert response.json()["count"] == 13
    assert len(many) == len(few)


# --- Teacher's own courses (T-02.8) --------------------------------------------------------


def test_rn_009_1_teacher_sees_only_their_courses_with_assigned_monitors(
    catalog: dict[str, Any],
) -> None:
    response = client_for(catalog["teacher"]).get(MINE_URL)

    assert response.status_code == 200
    results = response.json()["results"]
    assert [(c["subject"]["code"], c["group"], c["term"]) for c in results] == [
        ("MAT-101", "1", "2026-2")
    ]
    monitor = catalog["monitor"]
    assert results[0]["monitors"] == [
        {
            "id": str(monitor.pk),
            "full_name": "Sofía Díaz",
            "email": "sofia.diaz@unal.edu.co",
            "committed_hours": 6,
        }
    ]
    assert "teacher" not in results[0]


def test_rn_009_1_teacher_switches_term_and_sees_that_terms_monitors(
    catalog: dict[str, Any],
) -> None:
    response = client_for(catalog["teacher"]).get(MINE_URL, {"term": "2026-1"})

    results = response.json()["results"]
    assert [(c["subject"]["code"], c["term"]) for c in results] == [("FIS-201", "2026-1")]
    assert [m["email"] for m in results[0]["monitors"]] == ["antiguo@unal.edu.co"]


def test_rn_009_1_other_teacher_does_not_see_foreign_courses(catalog: dict[str, Any]) -> None:
    response = client_for(catalog["other_teacher"]).get(MINE_URL)

    assert [c["subject"]["code"] for c in response.json()["results"]] == ["FIS-201"]
    assert response.json()["results"][0]["monitors"] == []


def test_teacher_courses_reject_unknown_term(catalog: dict[str, Any]) -> None:
    assert client_for(catalog["teacher"]).get(MINE_URL, {"term": "2030-2"}).status_code == 400


def test_teacher_course_list_query_count_does_not_grow_with_rows(catalog: dict[str, Any]) -> None:
    client = client_for(catalog["teacher"])
    with CaptureQueriesContext(connection) as few:
        client.get(MINE_URL)
    for group in range(3, 8):
        make_course(catalog["calculo"], catalog["current"], str(group), catalog["teacher"])
        extra = make_user(f"monitor{group}@unal.edu.co", Role.Code.MONITOR)
        make_assignment(extra, catalog["calculo"], catalog["current"])

    with CaptureQueriesContext(connection) as many:
        response = client.get(MINE_URL)

    assert response.json()["count"] == 6
    assert len(many) == len(few)


# --- Summary -------------------------------------------------------------------------------


def test_catalog_summary_for_the_current_term(
    admin_client: APIClient, catalog: dict[str, Any]
) -> None:
    make_subject("MAT-900", "Topología", department=catalog["mat"], is_active=False)

    response = admin_client.get(SUMMARY_URL)

    assert response.status_code == 200
    assert response.json() == {
        "term": "2026-2",
        "subjects_active": 2,
        "departments_active": 2,
        "courses": 3,
        "courses_without_teacher": 1,
        "courses_without_monitor": 1,
        "monitor_assignments": 1,
        "committed_hours_total": 6,
    }


def test_catalog_summary_for_another_term(admin_client: APIClient, catalog: dict[str, Any]) -> None:
    body = admin_client.get(SUMMARY_URL, {"term": "2026-1"}).json()

    assert body["term"] == "2026-1"
    assert body["courses"] == 1
    assert body["courses_without_monitor"] == 0
    assert body["committed_hours_total"] == 4


def test_catalog_summary_without_terms(admin_client: APIClient) -> None:
    make_subject()

    assert admin_client.get(SUMMARY_URL).json() == {
        "term": None,
        "subjects_active": 1,
        "departments_active": 1,
        "courses": 0,
        "courses_without_teacher": 0,
        "courses_without_monitor": 0,
        "monitor_assignments": 0,
        "committed_hours_total": 0,
    }


def test_t_02_3_changing_group_onto_an_existing_course_is_rejected(
    admin_client: APIClient, catalog: dict[str, Any]
) -> None:
    url = f"{COURSES_URL}{catalog['calculo_2'].pk}/"

    clash = admin_client.patch(url, {"group": "1"}, format="json")
    moved = admin_client.patch(url, {"group": "b"}, format="json")

    assert clash.status_code == 400
    assert clash.json()["non_field_errors"] == [
        "Ya existe un curso de esta asignatura con ese grupo en el período."
    ]
    assert moved.status_code == 200
    assert moved.json()["group"] == "B"


def test_t_02_3_concurrent_duplicate_course_returns_400_not_500(
    admin_client: APIClient, catalog: dict[str, Any]
) -> None:
    # Both requests passed validation; the unique constraint rejects the second insert.
    with mock.patch(
        "apps.academics.views.create_course", side_effect=IntegrityError("duplicate key")
    ):
        response = admin_client.post(
            COURSES_URL,
            {"subject": catalog["mecanica"].pk, "term": "2026-2", "group": "7"},
            format="json",
        )

    assert response.status_code == 400
    assert response.json() == {
        "non_field_errors": ["Otro cambio simultáneo lo impidió. Vuelve a intentarlo."]
    }
