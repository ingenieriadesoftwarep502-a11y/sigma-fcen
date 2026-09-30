"""Academic terms: creation by the administrator and the term switcher (T-02.2)."""

from typing import Any

import pytest
from rest_framework.test import APIClient

from apps.academics.models import AcademicTerm
from apps.accounts.models import Role
from tests.catalog_data import client_for, make_current_and_previous_terms, make_term, make_user

pytestmark = pytest.mark.django_db

TERMS_URL = "/api/v1/terms/"
CURRENT_URL = "/api/v1/terms/current/"


@pytest.fixture
def admin_client() -> APIClient:
    return client_for(make_user("admin@unal.edu.co", Role.Code.ADMIN))


@pytest.fixture
def teacher_client() -> APIClient:
    return client_for(make_user("docente@unal.edu.co", Role.Code.TEACHER))


def test_t_02_2_admin_creates_term(admin_client: APIClient) -> None:
    response = admin_client.post(
        TERMS_URL,
        {"code": "2027-1", "start_date": "2027-02-01", "end_date": "2027-06-04"},
        format="json",
    )

    assert response.status_code == 201
    body = response.json()
    assert body == {
        "id": body["id"],
        "code": "2027-1",
        "start_date": "2027-02-01",
        "end_date": "2027-06-04",
    }


@pytest.mark.parametrize(
    ("overrides", "field", "message"),
    [
        ({"end_date": "2027-01-15"}, "end_date", "La fecha de fin debe ser posterior al inicio."),
        ({"end_date": "2027-02-01"}, "end_date", "La fecha de fin debe ser posterior al inicio."),
        (
            {"code": "2027-3"},
            "code",
            "Usa el formato AAAA-S, con semestre 1 o 2 (por ejemplo 2026-1).",
        ),
        ({"code": "2026-1"}, "code", "Ya existe un período con este código."),
    ],
)
def test_t_02_2_invalid_term_is_rejected(
    admin_client: APIClient, overrides: dict[str, Any], field: str, message: str
) -> None:
    make_term("2026-1")
    payload = {"code": "2027-1", "start_date": "2027-02-01", "end_date": "2027-06-04"}

    response = admin_client.post(TERMS_URL, {**payload, **overrides}, format="json")

    assert response.status_code == 400
    assert response.json()[field] == [message]
    assert AcademicTerm.objects.count() == 1


def test_any_authenticated_user_lists_terms_newest_first(teacher_client: APIClient) -> None:
    make_current_and_previous_terms()

    response = teacher_client.get(TERMS_URL)

    assert response.status_code == 200
    assert [term["code"] for term in response.json()["results"]] == ["2026-2", "2026-1"]


def test_current_term_is_the_one_containing_today(teacher_client: APIClient) -> None:
    current, _ = make_current_and_previous_terms()

    response = teacher_client.get(CURRENT_URL)

    assert response.status_code == 200
    assert response.json()["id"] == current.pk
    assert response.json()["code"] == "2026-2"


def test_current_term_is_404_when_no_term_exists(teacher_client: APIClient) -> None:
    response = teacher_client.get(CURRENT_URL)

    assert response.status_code == 404
    assert response.json() == {"detail": "No hay períodos académicos registrados."}
