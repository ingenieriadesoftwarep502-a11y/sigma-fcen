"""Catalog use cases that enforce role rules on assignments (T-02.5, RN-002, RF-023, RF-024)."""

from datetime import date

import pytest

from apps.academics.models import Course, MonitorAssignment
from apps.academics.services import (
    CatalogRuleError,
    create_course,
    create_monitor_assignment,
    ensure_monitor_assigned,
    is_monitor_assigned,
    update_course,
)
from apps.accounts.models import Role, UserRole
from tests.catalog_data import make_assignment, make_subject, make_term, make_user

pytestmark = pytest.mark.django_db


def test_t_02_5_monitor_role_holder_can_be_assigned() -> None:
    monitor = make_user("monitor@unal.edu.co", Role.Code.STUDENT, Role.Code.MONITOR)

    assignment = create_monitor_assignment(
        monitor=monitor, subject=make_subject(), term=make_term(), committed_hours=6
    )

    assert assignment.monitor == monitor
    assert MonitorAssignment.objects.count() == 1


@pytest.mark.parametrize("codes", [(), (Role.Code.STUDENT,), (Role.Code.TEACHER, Role.Code.ADMIN)])
def test_t_02_5_assigning_someone_without_the_monitor_role_fails(codes: tuple[str, ...]) -> None:
    user = make_user("persona@unal.edu.co", *codes)

    with pytest.raises(CatalogRuleError) as error:
        create_monitor_assignment(
            monitor=user, subject=make_subject(), term=make_term(), committed_hours=6
        )

    assert error.value.field == "monitor"
    assert MonitorAssignment.objects.count() == 0


def test_rf_024_course_teacher_must_hold_the_teacher_role() -> None:
    student = make_user("estudiante@unal.edu.co", Role.Code.STUDENT)

    with pytest.raises(CatalogRuleError) as error:
        create_course(subject=make_subject(), term=make_term(), group="1", teacher=student)

    assert error.value.field == "teacher"
    assert Course.objects.count() == 0


def test_rf_024_course_can_be_created_without_teacher_and_assigned_later() -> None:
    course = create_course(subject=make_subject(), term=make_term(), group="1", teacher=None)
    teacher = make_user("docente@unal.edu.co", Role.Code.TEACHER)

    update_course(course, {"teacher": teacher})

    course.refresh_from_db()
    assert course.teacher == teacher


def test_rf_024_updating_course_with_a_non_teacher_fails_and_keeps_the_teacher() -> None:
    teacher = make_user("docente@unal.edu.co", Role.Code.TEACHER)
    course = create_course(subject=make_subject(), term=make_term(), group="1", teacher=teacher)
    monitor = make_user("monitor@unal.edu.co", Role.Code.MONITOR)

    with pytest.raises(CatalogRuleError):
        update_course(course, {"teacher": monitor})

    course.refresh_from_db()
    assert course.teacher == teacher


def test_rn_003_5_assigned_monitor_may_attend_the_subject_in_that_term() -> None:
    monitor = make_user("monitor@unal.edu.co", Role.Code.MONITOR)
    subject, term = make_subject(), make_term()
    make_assignment(monitor, subject, term)

    assert is_monitor_assigned(monitor, subject, term)
    ensure_monitor_assigned(monitor, subject, term)


def test_rn_003_5_monitor_without_assignment_cannot_operate_on_the_subject() -> None:
    monitor = make_user("monitor@unal.edu.co", Role.Code.MONITOR)
    subject, term = make_subject(), make_term()

    assert not is_monitor_assigned(monitor, subject, term)
    with pytest.raises(CatalogRuleError) as error:
        ensure_monitor_assigned(monitor, subject, term)

    assert error.value.field == "subject"


def test_rn_003_5_assignment_does_not_carry_over_to_other_subjects_or_terms() -> None:
    monitor = make_user("monitor@unal.edu.co", Role.Code.MONITOR)
    subject, term = make_subject(), make_term()
    other_subject = make_subject("1000005", "Cálculo Integral")
    other_term = make_term("2026-1", date(2026, 2, 2), date(2026, 6, 5))
    make_assignment(monitor, subject, term)

    assert not is_monitor_assigned(monitor, other_subject, term)
    assert not is_monitor_assigned(monitor, subject, other_term)


def test_rn_003_5_another_monitors_assignment_does_not_authorize() -> None:
    monitor = make_user("monitor@unal.edu.co", Role.Code.MONITOR)
    colleague = make_user("colega@unal.edu.co", Role.Code.MONITOR)
    subject, term = make_subject(), make_term()
    make_assignment(colleague, subject, term)

    assert not is_monitor_assigned(monitor, subject, term)


def test_rn_002_assignment_stops_authorizing_once_the_monitor_role_is_revoked() -> None:
    monitor = make_user("monitor@unal.edu.co", Role.Code.STUDENT, Role.Code.MONITOR)
    subject, term = make_subject(), make_term()
    make_assignment(monitor, subject, term)

    UserRole.objects.filter(user=monitor, role__code=Role.Code.MONITOR).delete()

    assert not is_monitor_assigned(monitor, subject, term)
