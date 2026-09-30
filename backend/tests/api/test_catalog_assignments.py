"""Monitor assignments managed by the administrator (T-02.4, T-02.5, RF-023, RN-002)."""

from typing import Any

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from apps.academics.models import MonitorAssignment
from apps.accounts.models import Role
from tests.catalog_data import (
    client_for,
    make_assignment,
    make_current_and_previous_terms,
    make_subject,
    make_user,
)

pytestmark = pytest.mark.django_db

ASSIGNMENTS_URL = "/api/v1/monitor-assignments/"


@pytest.fixture
def admin_client() -> APIClient:
    return client_for(make_user("admin@unal.edu.co", Role.Code.ADMIN))


@pytest.fixture
def catalog() -> dict[str, Any]:
    current, previous = make_current_and_previous_terms()
    calculo = make_subject("MAT-101", "Cálculo Diferencial")
    mecanica = make_subject("FIS-201", "Mecánica")
    sofia = make_user(
        "sofia.diaz@unal.edu.co", Role.Code.MONITOR, first_name="Sofía", last_name="Díaz"
    )
    andres = make_user(
        "andres.mora@unal.edu.co", Role.Code.MONITOR, first_name="Andrés", last_name="Mora"
    )
    return {
        "current": current,
        "calculo": calculo,
        "mecanica": mecanica,
        "sofia": sofia,
        "andres": andres,
        "a1": make_assignment(sofia, calculo, current, committed_hours=6),
        "a2": make_assignment(andres, mecanica, current, committed_hours=4),
        "old": make_assignment(sofia, mecanica, previous, committed_hours=2),
    }


def _emails(response: Any) -> list[str]:
    return [a["monitor"]["email"] for a in response.json()["results"]]


def test_rf_023_admin_assigns_a_monitor(admin_client: APIClient, catalog: dict[str, Any]) -> None:
    andres, calculo = catalog["andres"], catalog["calculo"]

    response = admin_client.post(
        ASSIGNMENTS_URL,
        {"monitor": str(andres.pk), "subject": calculo.pk, "term": "2026-2", "committed_hours": 8},
        format="json",
    )

    assert response.status_code == 201
    body = response.json()
    assert body == {
        "id": body["id"],
        "monitor": {"id": str(andres.pk), "full_name": "Andrés Mora", "email": andres.email},
        "subject": {"id": calculo.pk, "code": "MAT-101", "name": "Cálculo Diferencial"},
        "term": "2026-2",
        "committed_hours": 8,
    }


def test_t_02_5_assigning_a_user_without_monitor_role_returns_400(
    admin_client: APIClient, catalog: dict[str, Any]
) -> None:
    student = make_user("estudiante@unal.edu.co", Role.Code.STUDENT)

    response = admin_client.post(
        ASSIGNMENTS_URL,
        {
            "monitor": str(student.pk),
            "subject": catalog["calculo"].pk,
            "term": "2026-2",
            "committed_hours": 8,
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.json() == {"monitor": ["El usuario no tiene el rol Monitor."]}


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"committed_hours": 0}, "committed_hours"),
        ({"term": "2030-1"}, "term"),
        ({"subject": 999_999}, "subject"),
        ({"monitor": "00000000-0000-0000-0000-000000000000"}, "monitor"),
        ({}, "non_field_errors"),
    ],
)
def test_t_02_4_invalid_or_duplicate_assignment_is_rejected(
    admin_client: APIClient, catalog: dict[str, Any], overrides: dict[str, Any], field: str
) -> None:
    payload = {
        "monitor": str(catalog["sofia"].pk),
        "subject": catalog["calculo"].pk,
        "term": "2026-2",
        "committed_hours": 5,
    }

    response = admin_client.post(ASSIGNMENTS_URL, {**payload, **overrides}, format="json")

    assert response.status_code == 400
    assert field in response.json()
    assert MonitorAssignment.objects.count() == 3


def test_t_02_4_duplicate_assignment_message(
    admin_client: APIClient, catalog: dict[str, Any]
) -> None:
    payload = {
        "monitor": str(catalog["sofia"].pk),
        "subject": catalog["calculo"].pk,
        "term": "2026-2",
        "committed_hours": 5,
    }

    response = admin_client.post(ASSIGNMENTS_URL, payload, format="json")

    assert response.json()["non_field_errors"] == [
        "El monitor ya está asignado a esta asignatura en el período."
    ]


def test_admin_removes_an_assignment(admin_client: APIClient, catalog: dict[str, Any]) -> None:
    response = admin_client.delete(f"{ASSIGNMENTS_URL}{catalog['a1'].pk}/")

    assert response.status_code == 204
    assert not MonitorAssignment.objects.filter(pk=catalog["a1"].pk).exists()
    assert admin_client.delete(f"{ASSIGNMENTS_URL}{catalog['a1'].pk}/").status_code == 404


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({}, ["sofia.diaz@unal.edu.co", "andres.mora@unal.edu.co"]),
        ({"term": "2026-1"}, ["sofia.diaz@unal.edu.co"]),
        ({"search": "mora"}, ["andres.mora@unal.edu.co"]),
        ({"search": "andrés mora"}, ["andres.mora@unal.edu.co"]),
        ({"search": "mat-101"}, ["sofia.diaz@unal.edu.co"]),
        ({"search": "mecánica"}, ["andres.mora@unal.edu.co"]),
    ],
)
def test_assignment_filters(
    admin_client: APIClient,
    catalog: dict[str, Any],
    params: dict[str, str],
    expected: list[str],
) -> None:
    assert _emails(admin_client.get(ASSIGNMENTS_URL, params)) == expected


def test_assignments_filter_by_subject_and_monitor(
    admin_client: APIClient, catalog: dict[str, Any]
) -> None:
    by_subject = admin_client.get(ASSIGNMENTS_URL, {"subject": catalog["mecanica"].pk})
    by_monitor = admin_client.get(
        ASSIGNMENTS_URL, {"monitor": str(catalog["sofia"].pk), "term": "2026-1"}
    )

    assert _emails(by_subject) == ["andres.mora@unal.edu.co"]
    assert [a["subject"]["code"] for a in by_monitor.json()["results"]] == ["FIS-201"]


def test_assignments_reject_unknown_term(admin_client: APIClient, catalog: dict[str, Any]) -> None:
    assert admin_client.get(ASSIGNMENTS_URL, {"term": "2031-1"}).status_code == 400


def test_assignment_list_query_count_does_not_grow_with_rows(
    admin_client: APIClient, catalog: dict[str, Any]
) -> None:
    with CaptureQueriesContext(connection) as few:
        admin_client.get(ASSIGNMENTS_URL)
    for number in range(10):
        monitor = make_user(f"monitor{number}@unal.edu.co", Role.Code.MONITOR)
        make_assignment(monitor, catalog["calculo"], catalog["current"])

    with CaptureQueriesContext(connection) as many:
        response = admin_client.get(ASSIGNMENTS_URL)

    assert response.json()["count"] == 12
    assert len(many) == len(few)
