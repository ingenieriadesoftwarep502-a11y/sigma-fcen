"""Academic catalog entities and their database constraints (FASE-02, DDD section 4.2).

T-02.0 to T-02.4 and T-02.7. Every invariant is enforced by the database, not only by the API.
"""

from datetime import date

import pytest
from django.core.exceptions import ValidationError
from django.db import DatabaseError, transaction
from django.db.models import ProtectedError

from apps.academics.domain.rules import InactiveSubjectError, ensure_accepts_new_slots
from apps.academics.models import AcademicTerm, Course, Department, MonitorAssignment, Subject
from apps.accounts.models import Role
from tests.catalog_data import (
    make_assignment,
    make_course,
    make_department,
    make_subject,
    make_term,
    make_user,
)

pytestmark = pytest.mark.django_db


def _rejected(create: object) -> None:
    # IntegrityError for constraints; DataError when a value does not even fit the column.
    with pytest.raises(DatabaseError), transaction.atomic():
        create()  # type: ignore[operator]


# --- T-02.0 Department ---------------------------------------------------------------------


def test_t_02_0_duplicate_department_code_is_rejected() -> None:
    make_department("MAT", "Matemáticas")

    _rejected(lambda: make_department("MAT", "Otra"))


def test_t_02_0_duplicate_department_name_is_rejected_regardless_of_case() -> None:
    make_department("MAT", "Matemáticas")

    _rejected(lambda: make_department("MAT2", "MATEMÁTICAS"))


def test_t_02_0_department_code_must_be_uppercase() -> None:
    _rejected(lambda: make_department("mat", "Matemáticas"))


def test_t_02_0_subject_cannot_exist_without_department() -> None:
    _rejected(
        lambda: Subject.objects.create(
            code="1000004",
            name="Cálculo",
            credits=4,
            department=None,  # type: ignore[misc]
        )
    )


def test_t_02_0_department_with_subjects_cannot_be_deleted() -> None:
    subject = make_subject()

    with pytest.raises(ProtectedError):
        subject.department.delete()


# --- T-02.1 Subject ------------------------------------------------------------------------


def test_t_02_1_duplicate_subject_code_is_rejected() -> None:
    make_subject("1000004")

    _rejected(lambda: make_subject("1000004", "Otra asignatura"))


def test_t_02_1_subject_code_must_be_uppercase() -> None:
    _rejected(lambda: make_subject("mat-101"))


@pytest.mark.parametrize("credits", [0, -1])
def test_t_02_1_subject_credits_must_be_positive(credits: int) -> None:
    _rejected(lambda: make_subject(credits=credits))


# --- T-02.2 AcademicTerm -------------------------------------------------------------------


@pytest.mark.parametrize("end", [date(2026, 1, 31), date(2026, 2, 1)])
def test_t_02_2_term_ending_before_or_on_its_start_is_rejected(end: date) -> None:
    _rejected(lambda: make_term("2026-1", date(2026, 2, 1), end))


@pytest.mark.parametrize("code", ["2026-3", "2026-0", "26-1", "2026/1", "2026-A", "2026-12"])
def test_t_02_2_term_code_outside_yyyy_s_format_is_rejected(code: str) -> None:
    _rejected(lambda: make_term(code))


def test_t_02_2_term_code_format_is_also_checked_by_model_validation() -> None:
    term = AcademicTerm(code="2026-3", start_date=date(2026, 8, 1), end_date=date(2026, 12, 1))

    with pytest.raises(ValidationError) as error:
        term.full_clean()

    assert "code" in error.value.message_dict


def test_t_02_2_duplicate_term_code_is_rejected() -> None:
    make_term("2026-1", date(2026, 2, 2), date(2026, 6, 5))

    _rejected(lambda: make_term("2026-1", date(2027, 2, 2), date(2027, 6, 5)))


def test_current_term_is_the_one_containing_today() -> None:
    make_term("2026-1", date(2026, 2, 2), date(2026, 6, 5))
    second = make_term("2026-2", date(2026, 8, 3), date(2026, 12, 4))

    assert AcademicTerm.objects.current(today=date(2026, 9, 29)) == second
    # Both boundaries belong to the term.
    assert AcademicTerm.objects.current(today=date(2026, 8, 3)) == second
    assert AcademicTerm.objects.current(today=date(2026, 12, 4)) == second


def test_current_term_between_terms_is_the_most_recent_past_one() -> None:
    first = make_term("2026-1", date(2026, 2, 2), date(2026, 6, 5))
    make_term("2026-2", date(2026, 8, 3), date(2026, 12, 4))
    make_term("2025-2", date(2025, 8, 4), date(2025, 12, 5))

    assert AcademicTerm.objects.current(today=date(2026, 7, 1)) == first


def test_current_term_before_any_term_is_the_nearest_upcoming_one() -> None:
    make_term("2027-1", date(2027, 2, 1), date(2027, 6, 4))
    upcoming = make_term("2026-2", date(2026, 8, 3), date(2026, 12, 4))

    assert AcademicTerm.objects.current(today=date(2026, 1, 1)) == upcoming


def test_current_term_is_none_without_terms() -> None:
    assert AcademicTerm.objects.current(today=date(2026, 1, 1)) is None


# --- T-02.3 Course -------------------------------------------------------------------------


def test_t_02_3_duplicate_course_by_subject_term_and_group_is_rejected() -> None:
    subject, term = make_subject(), make_term()
    make_course(subject, term, "1")

    _rejected(lambda: make_course(subject, term, "1"))


def test_t_02_3_same_subject_may_have_other_groups_and_other_terms() -> None:
    subject, term = make_subject(), make_term()
    other_term = make_term("2027-1", date(2027, 2, 1), date(2027, 6, 4))
    make_course(subject, term, "1")

    make_course(subject, term, "2")
    make_course(subject, other_term, "1")

    assert Course.objects.count() == 3


def test_t_02_3_course_group_cannot_be_blank() -> None:
    _rejected(lambda: make_course(make_subject(), make_term(), ""))


# --- T-02.4 MonitorAssignment --------------------------------------------------------------


def test_t_02_4_duplicate_assignment_by_monitor_subject_and_term_is_rejected() -> None:
    monitor = make_user("monitor@unal.edu.co", Role.Code.MONITOR)
    subject, term = make_subject(), make_term()
    make_assignment(monitor, subject, term)

    _rejected(lambda: make_assignment(monitor, subject, term, committed_hours=4))


@pytest.mark.parametrize("hours", [0, -2])
def test_t_02_4_committed_hours_must_be_positive(hours: int) -> None:
    monitor = make_user("monitor@unal.edu.co", Role.Code.MONITOR)

    _rejected(lambda: make_assignment(monitor, make_subject(), make_term(), hours))


def test_t_02_4_subject_with_assignments_cannot_be_deleted() -> None:
    monitor = make_user("monitor@unal.edu.co", Role.Code.MONITOR)
    assignment = make_assignment(monitor, make_subject(), make_term())

    with pytest.raises(ProtectedError):
        assignment.subject.delete()

    assert MonitorAssignment.objects.count() == 1


# --- T-02.7 Inactive subject ---------------------------------------------------------------


def test_t_02_7_active_subject_accepts_new_slots() -> None:
    subject = make_subject()

    assert subject.accepts_new_slots is True
    ensure_accepts_new_slots(subject)


def test_t_02_7_inactive_subject_does_not_accept_new_slots() -> None:
    subject = make_subject(is_active=False)

    assert subject.accepts_new_slots is False
    with pytest.raises(InactiveSubjectError, match="inactiva"):
        ensure_accepts_new_slots(subject)


def test_departments_list_in_name_order() -> None:
    make_department("QUI", "Química")
    make_department("BIO", "Biología")

    assert list(Department.objects.values_list("code", flat=True)) == ["BIO", "QUI"]
