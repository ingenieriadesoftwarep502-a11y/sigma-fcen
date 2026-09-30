"""Departments and subjects: administration and catalog queries (T-02.0, T-02.1, T-02.6, RF-022)."""

from typing import Any

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from apps.academics.models import Department, Subject
from apps.accounts.models import Role
from tests.catalog_data import (
    client_for,
    make_assignment,
    make_current_and_previous_terms,
    make_department,
    make_subject,
    make_user,
)

pytestmark = pytest.mark.django_db

DEPARTMENTS_URL = "/api/v1/departments/"
SUBJECTS_URL = "/api/v1/subjects/"


@pytest.fixture
def admin_client() -> APIClient:
    return client_for(make_user("admin@unal.edu.co", Role.Code.ADMIN))


@pytest.fixture
def student_client() -> APIClient:
    return client_for(make_user("estudiante@unal.edu.co", Role.Code.STUDENT))


def _codes(response: Any) -> list[str]:
    return [item["code"] for item in response.json()["results"]]


# --- Departments ---------------------------------------------------------------------------


def test_t_02_0_admin_creates_department_with_normalized_code(admin_client: APIClient) -> None:
    response = admin_client.post(
        DEPARTMENTS_URL, {"code": " fis ", "name": "Física"}, format="json"
    )

    assert response.status_code == 201
    body = response.json()
    assert body == {"id": body["id"], "code": "FIS", "name": "Física", "is_active": True}


@pytest.mark.parametrize(
    ("payload", "field"),
    [
        ({"code": "mat", "name": "Otra"}, "code"),
        ({"code": "OTR", "name": "matemáticas"}, "name"),
        ({"code": "M-1", "name": "Otra"}, "code"),
        ({"code": "", "name": "Otra"}, "code"),
    ],
)
def test_t_02_0_duplicate_or_malformed_department_is_rejected(
    admin_client: APIClient, payload: dict[str, str], field: str
) -> None:
    make_department("MAT", "Matemáticas")

    response = admin_client.post(DEPARTMENTS_URL, payload, format="json")

    assert response.status_code == 400
    assert field in response.json()
    assert Department.objects.count() == 1


def test_t_02_0_admin_renames_and_deactivates_department(admin_client: APIClient) -> None:
    department = make_department()

    response = admin_client.patch(
        f"{DEPARTMENTS_URL}{department.pk}/",
        {"name": "Matemáticas Aplicadas", "is_active": False},
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Matemáticas Aplicadas"
    assert response.json()["is_active"] is False


def test_t_02_6_non_admins_only_see_active_departments(student_client: APIClient) -> None:
    make_department("MAT", "Matemáticas")
    hidden = make_department("GEO", "Geociencias", is_active=False)

    assert _codes(student_client.get(DEPARTMENTS_URL, {"active": "false"})) == ["MAT"]
    assert student_client.get(f"{DEPARTMENTS_URL}{hidden.pk}/").status_code == 404


def test_admin_filters_departments_by_state(admin_client: APIClient) -> None:
    make_department("MAT", "Matemáticas")
    make_department("GEO", "Geociencias", is_active=False)

    assert _codes(admin_client.get(DEPARTMENTS_URL)) == ["GEO", "MAT"]
    assert _codes(admin_client.get(DEPARTMENTS_URL, {"active": "false"})) == ["GEO"]
    assert admin_client.get(DEPARTMENTS_URL, {"active": "yes"}).status_code == 400


# --- Subjects: administration --------------------------------------------------------------


def test_t_02_1_admin_creates_subject_with_department_summary(admin_client: APIClient) -> None:
    department = make_department()

    response = admin_client.post(
        SUBJECTS_URL,
        {
            "code": "mat-101",
            "name": "Cálculo Diferencial",
            "credits": 4,
            "department": department.pk,
        },
        format="json",
    )

    assert response.status_code == 201
    body = response.json()
    assert body == {
        "id": body["id"],
        "code": "MAT-101",
        "name": "Cálculo Diferencial",
        "credits": 4,
        "is_active": True,
        "department": {"id": department.pk, "code": "MAT", "name": "Matemáticas"},
        "monitor_count": 0,
    }


def test_t_02_1_duplicate_subject_code_is_rejected_regardless_of_case(
    admin_client: APIClient,
) -> None:
    subject = make_subject("MAT-101")

    response = admin_client.post(
        SUBJECTS_URL,
        {"code": "mat-101", "name": "Otra", "credits": 3, "department": subject.department_id},
        format="json",
    )

    assert response.status_code == 400
    assert response.json()["code"] == ["Ya existe una asignatura con este código."]
    assert Subject.objects.count() == 1


@pytest.mark.parametrize(
    ("overrides", "field"),
    [({"credits": 0}, "credits"), ({"department": 999_999}, "department"), ({"name": ""}, "name")],
)
def test_t_02_1_invalid_subject_is_rejected(
    admin_client: APIClient, overrides: dict[str, Any], field: str
) -> None:
    department = make_department()
    payload = {"code": "MAT-101", "name": "Cálculo", "credits": 4, "department": department.pk}

    response = admin_client.post(SUBJECTS_URL, {**payload, **overrides}, format="json")

    assert response.status_code == 400
    assert field in response.json()


def test_t_02_7_admin_deactivates_subject_and_non_admins_stop_seeing_it(
    admin_client: APIClient, student_client: APIClient
) -> None:
    subject = make_subject()

    response = admin_client.patch(
        f"{SUBJECTS_URL}{subject.pk}/", {"is_active": False, "credits": 3}, format="json"
    )

    assert response.status_code == 200
    assert response.json()["is_active"] is False
    assert response.json()["credits"] == 3
    assert student_client.get(f"{SUBJECTS_URL}{subject.pk}/").status_code == 404
    assert _codes(student_client.get(SUBJECTS_URL, {"active": "false"})) == []
    assert admin_client.get(f"{SUBJECTS_URL}{subject.pk}/").status_code == 200


# --- Subjects: catalog queries -------------------------------------------------------------


@pytest.fixture
def catalog() -> dict[str, Any]:
    current, previous = make_current_and_previous_terms()
    mat = make_department("MAT", "Matemáticas")
    fis = make_department("FIS", "Física")
    calculo = make_subject("MAT-101", "Cálculo Diferencial", department=mat, credits=4)
    algebra = make_subject("MAT-102", "Algebra Lineal", department=mat, credits=3)
    mecanica = make_subject("FIS-201", "Mecánica", department=fis, credits=4)
    make_subject("MAT-900", "Topología", department=mat, is_active=False)
    first = make_user("m1@unal.edu.co", Role.Code.MONITOR)
    second = make_user("m2@unal.edu.co", Role.Code.MONITOR)
    make_assignment(first, calculo, current)
    make_assignment(second, calculo, current)
    make_assignment(first, mecanica, previous)
    return {"current": current, "previous": previous, "mat": mat, "algebra": algebra}


def test_subjects_are_paginated_in_name_order_with_current_term_monitor_count(
    student_client: APIClient, catalog: dict[str, Any]
) -> None:
    response = student_client.get(SUBJECTS_URL)

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 3
    assert [(s["code"], s["monitor_count"]) for s in body["results"]] == [
        ("MAT-102", 0),
        ("MAT-101", 2),
        ("FIS-201", 0),
    ]


def test_subject_monitor_count_follows_the_requested_term(
    student_client: APIClient, catalog: dict[str, Any]
) -> None:
    response = student_client.get(SUBJECTS_URL, {"term": "2026-1", "ordering": "code"})

    counts = {s["code"]: s["monitor_count"] for s in response.json()["results"]}
    assert counts == {"FIS-201": 1, "MAT-101": 0, "MAT-102": 0}


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({"search": "cálculo"}, ["MAT-101"]),
        ({"search": "fis-2"}, ["FIS-201"]),
        ({"department": "fis"}, ["FIS-201"]),
        ({"credits": "3"}, ["MAT-102"]),
        ({"has_monitors": "true"}, ["MAT-101"]),
        ({"has_monitors": "false", "ordering": "code"}, ["FIS-201", "MAT-102"]),
        ({"ordering": "-monitor_count"}, ["MAT-101", "MAT-102", "FIS-201"]),
        ({"ordering": "code"}, ["FIS-201", "MAT-101", "MAT-102"]),
    ],
)
def test_subject_filters(
    student_client: APIClient,
    catalog: dict[str, Any],
    params: dict[str, str],
    expected: list[str],
) -> None:
    assert _codes(student_client.get(SUBJECTS_URL, params)) == expected


def test_subjects_filter_by_department_id(
    student_client: APIClient, catalog: dict[str, Any]
) -> None:
    response = student_client.get(SUBJECTS_URL, {"department": catalog["mat"].pk})

    assert _codes(response) == ["MAT-102", "MAT-101"]


def test_admin_sees_inactive_subjects_on_request(
    admin_client: APIClient, catalog: dict[str, Any]
) -> None:
    assert _codes(admin_client.get(SUBJECTS_URL, {"active": "false"})) == ["MAT-900"]
    assert admin_client.get(SUBJECTS_URL).json()["count"] == 4


@pytest.mark.parametrize(
    ("params", "field"),
    [
        ({"active": "1"}, "active"),
        ({"has_monitors": "yes"}, "has_monitors"),
        ({"term": "2030-1"}, "term"),
        ({"ordering": "credits"}, "ordering"),
        ({"credits": "0"}, "credits"),
    ],
)
def test_invalid_subject_query_parameters_return_400(
    student_client: APIClient, catalog: dict[str, Any], params: dict[str, str], field: str
) -> None:
    response = student_client.get(SUBJECTS_URL, params)

    assert response.status_code == 400
    assert field in response.json()


def test_subject_list_query_count_does_not_grow_with_rows(
    admin_client: APIClient, catalog: dict[str, Any]
) -> None:
    with CaptureQueriesContext(connection) as few:
        admin_client.get(SUBJECTS_URL)
    for number in range(10):
        make_subject(f"EXTRA-{number}", f"Extra {number}", department=catalog["mat"])

    with CaptureQueriesContext(connection) as many:
        response = admin_client.get(SUBJECTS_URL)

    assert response.json()["count"] == 14
    assert len(many) == len(few)


def test_subject_detail_includes_current_term_monitor_count(
    student_client: APIClient, catalog: dict[str, Any]
) -> None:
    calculo = Subject.objects.get(code="MAT-101")

    response = student_client.get(f"{SUBJECTS_URL}{calculo.pk}/")

    assert response.status_code == 200
    assert response.json()["monitor_count"] == 2


def test_subjects_without_any_term_report_zero_monitors(student_client: APIClient) -> None:
    make_subject()

    response = student_client.get(SUBJECTS_URL)

    assert response.json()["results"][0]["monitor_count"] == 0
