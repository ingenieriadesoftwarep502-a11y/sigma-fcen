"""Catalog use cases that enforce role rules on assignments (T-02.5, RN-002, RF-023, RF-024)."""

import pytest

from apps.academics.models import Course, MonitorAssignment
from apps.academics.services import (
    CatalogRuleError,
    create_course,
    create_monitor_assignment,
    update_course,
)
from apps.accounts.models import Role
from tests.catalog_data import make_subject, make_term, make_user

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
