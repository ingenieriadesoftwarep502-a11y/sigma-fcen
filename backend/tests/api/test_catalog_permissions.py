"""Who may call each catalog endpoint (T-02.6, RNF-SEC-003, RNF-SEC-004, RN-002.1, RN-009.1).

Anonymous requests get 401 everywhere; an authenticated user without the required role, 403.
"""

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Role
from tests.catalog_data import (
    client_for,
    make_assignment,
    make_course,
    make_subject,
    make_term,
    make_user,
)

pytestmark = pytest.mark.django_db

API = "/api/v1"


@pytest.fixture
def urls() -> dict[str, str]:
    subject, term = make_subject(), make_term()
    course = make_course(subject, term)
    monitor = make_user("monitor.base@unal.edu.co", Role.Code.MONITOR)
    assignment = make_assignment(monitor, subject, term)
    return {
        "departments": f"{API}/departments/",
        "department": f"{API}/departments/{subject.department_id}/",
        "subjects": f"{API}/subjects/",
        "subject": f"{API}/subjects/{subject.pk}/",
        "terms": f"{API}/terms/",
        "current_term": f"{API}/terms/current/",
        "courses": f"{API}/courses/",
        "course": f"{API}/courses/{course.pk}/",
        "my_courses": f"{API}/courses/mine/",
        "my_assignments": f"{API}/monitor-assignments/mine/",
        "assignments": f"{API}/monitor-assignments/",
        "assignment": f"{API}/monitor-assignments/{assignment.pk}/",
        "summary": f"{API}/catalog/summary/",
    }


READ_FOR_ANYONE = [
    ("get", "departments"),
    ("get", "department"),
    ("get", "subjects"),
    ("get", "subject"),
    ("get", "terms"),
    ("get", "current_term"),
]
ADMIN_ONLY = [
    ("post", "departments"),
    ("patch", "department"),
    ("post", "subjects"),
    ("patch", "subject"),
    ("post", "terms"),
    ("get", "courses"),
    ("post", "courses"),
    ("get", "course"),
    ("patch", "course"),
    ("get", "assignments"),
    ("post", "assignments"),
    ("delete", "assignment"),
    ("get", "summary"),
]
TEACHER_ONLY = [("get", "my_courses")]
MONITOR_ONLY = [("get", "my_assignments")]


@pytest.mark.parametrize(
    ("method", "name"), READ_FOR_ANYONE + ADMIN_ONLY + TEACHER_ONLY + MONITOR_ONLY
)
def test_rnf_sec_003_anonymous_gets_401_on_every_catalog_endpoint(
    urls: dict[str, str], method: str, name: str
) -> None:
    assert getattr(APIClient(), method)(urls[name]).status_code == 401


@pytest.mark.parametrize("code", [Role.Code.STUDENT, Role.Code.MONITOR, Role.Code.TEACHER])
@pytest.mark.parametrize(("method", "name"), ADMIN_ONLY)
def test_t_02_6_non_admin_roles_get_403_on_catalog_writes_and_admin_views(
    urls: dict[str, str], method: str, name: str, code: str
) -> None:
    client = client_for(make_user(f"{code.lower()}@unal.edu.co", code))

    assert getattr(client, method)(urls[name], {}, format="json").status_code == 403


@pytest.mark.parametrize("codes", [(), (Role.Code.STUDENT,), (Role.Code.TEACHER,)])
@pytest.mark.parametrize(("method", "name"), READ_FOR_ANYONE)
def test_t_02_6_any_authenticated_user_reads_the_catalog(
    urls: dict[str, str], method: str, name: str, codes: tuple[str, ...]
) -> None:
    client = client_for(make_user("lector@unal.edu.co", *codes))

    assert getattr(client, method)(urls[name]).status_code == 200


@pytest.mark.parametrize("code", [Role.Code.STUDENT, Role.Code.MONITOR, Role.Code.ADMIN])
def test_rn_009_1_only_teachers_reach_their_course_list(urls: dict[str, str], code: str) -> None:
    client = client_for(make_user(f"{code.lower()}@unal.edu.co", code))

    assert client.get(urls["my_courses"]).status_code == 403


def test_rn_009_1_teacher_reaches_their_course_list(urls: dict[str, str]) -> None:
    client = client_for(make_user("docente@unal.edu.co", Role.Code.TEACHER))

    assert client.get(urls["my_courses"]).status_code == 200


@pytest.mark.parametrize(
    "codes",
    [
        (Role.Code.STUDENT,),
        (Role.Code.TEACHER,),
        (Role.Code.ADMIN,),
        (Role.Code.TEACHER, Role.Code.ADMIN),
    ],
)
def test_rn_009_1_only_monitors_reach_their_assignment_list(
    urls: dict[str, str], codes: tuple[str, ...]
) -> None:
    client = client_for(make_user("sin.monitoria@unal.edu.co", *codes))

    assert client.get(urls["my_assignments"]).status_code == 403


@pytest.mark.parametrize("codes", [(Role.Code.MONITOR,), (Role.Code.STUDENT, Role.Code.MONITOR)])
def test_rn_009_1_monitor_reaches_their_assignment_list(
    urls: dict[str, str], codes: tuple[str, ...]
) -> None:
    client = client_for(make_user("monitor@unal.edu.co", *codes))

    assert client.get(urls["my_assignments"]).status_code == 200
