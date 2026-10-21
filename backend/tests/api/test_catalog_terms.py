"""Academic terms: creation by the administrator and the term switcher (T-02.2)."""

from datetime import date, timedelta
from typing import Any

import pytest
from rest_framework.test import APIClient

from apps.academics.models import AcademicTerm
from apps.accounts.models import Role
from tests.availability_data import SLOT_START, make_assigned_monitor, make_slot
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


# --- Editing a term ------------------------------------------------------------------------


def _term_url(term: AcademicTerm) -> str:
    return f"{TERMS_URL}{term.pk}/"


def test_any_authenticated_user_reads_one_term(teacher_client: APIClient) -> None:
    term = make_term("2026-1", date(2026, 2, 2), date(2026, 6, 5))

    response = teacher_client.get(_term_url(term))

    assert response.status_code == 200
    assert response.json() == {
        "id": term.pk,
        "code": "2026-1",
        "start_date": "2026-02-02",
        "end_date": "2026-06-05",
    }


def test_admin_extends_a_term_whose_end_date_already_passed(admin_client: APIClient) -> None:
    term = make_term("2026-1", date(2026, 2, 2), date(2026, 6, 5))

    response = admin_client.patch(_term_url(term), {"end_date": "2026-07-31"}, format="json")

    assert response.status_code == 200
    assert response.json()["end_date"] == "2026-07-31"
    term.refresh_from_db()
    assert term.end_date == date(2026, 7, 31)
    assert term.start_date == date(2026, 2, 2)


def test_admin_edits_code_and_both_dates(admin_client: APIClient) -> None:
    term = make_term("2026-1", date(2026, 2, 2), date(2026, 6, 5))

    response = admin_client.patch(
        _term_url(term),
        {"code": "2027-1", "start_date": "2027-02-01", "end_date": "2027-06-04"},
        format="json",
    )

    assert response.status_code == 200
    assert response.json() == {
        "id": term.pk,
        "code": "2027-1",
        "start_date": "2027-02-01",
        "end_date": "2027-06-04",
    }


def test_keeping_the_same_code_is_not_a_duplicate(admin_client: APIClient) -> None:
    term = make_term("2026-1", date(2026, 2, 2), date(2026, 6, 5))

    response = admin_client.patch(_term_url(term), {"code": "2026-1"}, format="json")

    assert response.status_code == 200


@pytest.mark.parametrize(
    ("payload", "field", "message"),
    [
        ({"end_date": "2026-02-01"}, "end_date", "La fecha de fin debe ser posterior al inicio."),
        ({"start_date": "2026-06-05"}, "end_date", "La fecha de fin debe ser posterior al inicio."),
        (
            {"code": "2026-3"},
            "code",
            "Usa el formato AAAA-S, con semestre 1 o 2 (por ejemplo 2026-1).",
        ),
        ({"code": "2026-2"}, "code", "Ya existe un período con este código."),
    ],
)
def test_invalid_term_edit_is_rejected(
    admin_client: APIClient, payload: dict[str, Any], field: str, message: str
) -> None:
    make_term("2026-2")
    term = make_term("2026-1", date(2026, 2, 2), date(2026, 6, 5))

    response = admin_client.patch(_term_url(term), payload, format="json")

    assert response.status_code == 400
    assert response.json()[field] == [message]
    term.refresh_from_db()
    assert (term.code, term.start_date, term.end_date) == (
        "2026-1",
        date(2026, 2, 2),
        date(2026, 6, 5),
    )


@pytest.mark.parametrize("method", ["put", "delete"])
def test_terms_are_neither_replaced_nor_deleted(admin_client: APIClient, method: str) -> None:
    term = make_term("2026-1", date(2026, 2, 2), date(2026, 6, 5))

    response = getattr(admin_client, method)(
        _term_url(term),
        {"code": "2026-1", "start_date": "2026-02-02", "end_date": "2026-06-05"},
        format="json",
    )

    assert response.status_code == 405
    assert AcademicTerm.objects.filter(pk=term.pk).exists()


def test_shortening_a_term_cannot_leave_its_slots_outside(admin_client: APIClient) -> None:
    monitor, subject, term = make_assigned_monitor()
    make_slot(monitor, subject, term)
    slot_day = SLOT_START.date()

    response = admin_client.patch(
        _term_url(term), {"end_date": str(slot_day - timedelta(days=1))}, format="json"
    )

    assert response.status_code == 400
    assert response.json()["end_date"] == [
        f"Hay franjas de disponibilidad del período hasta el {slot_day:%Y-%m-%d}; "
        "la fecha de fin no puede ser anterior."
    ]
    end_date = term.end_date
    term.refresh_from_db()
    assert term.end_date == end_date


def test_moving_the_start_cannot_leave_slots_outside(admin_client: APIClient) -> None:
    monitor, subject, term = make_assigned_monitor()
    make_slot(monitor, subject, term)
    slot_day = SLOT_START.date()

    response = admin_client.patch(
        _term_url(term), {"start_date": str(slot_day + timedelta(days=1))}, format="json"
    )

    assert response.status_code == 400
    assert response.json()["start_date"] == [
        f"Hay franjas de disponibilidad del período desde el {slot_day:%Y-%m-%d}; "
        "la fecha de inicio no puede ser posterior."
    ]


def test_dates_may_shrink_to_the_days_of_the_slots(admin_client: APIClient) -> None:
    monitor, subject, term = make_assigned_monitor()
    make_slot(monitor, subject, term)
    slot_day = SLOT_START.date()

    response = admin_client.patch(
        _term_url(term),
        {"start_date": str(slot_day), "end_date": str(slot_day + timedelta(days=1))},
        format="json",
    )

    assert response.status_code == 200
