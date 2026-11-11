"""Teacher follow-up HTTP API (FASE-08 §4): HU-09, RF-080 to RF-083, CA-HU09-1 to CA-HU09-4.

A session belongs to a course when its slot has the course's subject and term (the same rule
FASE-05 uses to let the course's teacher read a session). Every endpoint is read-only, for the
TEACHER role only, and answers 403 for another teacher's course (RN-009.1, RNF-SEC-004).

RF-083, confirmed 2026-11-10 (option A): the frequent difficulties are the topics most
repeated across the sessions of the teacher's courses, most frequent first.
"""

from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from apps.academics.models import AcademicTerm, Course, Subject
from apps.accounts.models import Role, User
from apps.availability.domain.rules import LOCAL_TZ
from apps.reservations.models import Reservation
from apps.tutoring_sessions.domain.rules import AttendanceStatus
from apps.tutoring_sessions.models import TutoringSession
from tests.availability_data import current_term
from tests.catalog_data import (
    client_for,
    make_assignment,
    make_course,
    make_subject,
    make_term,
    make_user,
)
from tests.evaluation_data import attend, make_evaluation
from tests.reservation_data import make_reservation, make_student
from tests.session_data import make_session, make_started_slot, make_topic

pytestmark = pytest.mark.django_db

BASE = "/api/v1/teaching"
COURSES_URL = f"{BASE}/courses/"
MONITORS_URL = f"{BASE}/monitors/"
SESSIONS_URL = f"{BASE}/sessions/"
STUDENTS_URL = f"{BASE}/students/"
TOPICS_URL = f"{BASE}/frequent-topics/"
# The endpoints that take a `course` filter; the course detail takes it in the path.
FILTERED_URLS = [MONITORS_URL, SESSIONS_URL, STUDENTS_URL, TOPICS_URL]
LIST_URLS = [COURSES_URL, *FILTERED_URLS]
FOREIGN_COURSE_MESSAGE = "Solo puedes consultar tus propios cursos."

COURSE_KEYS = {
    "id",
    "subject",
    "term",
    "group",
    "monitor_count",
    "session_count",
    "student_count",
}
MONITOR_KEYS = {
    "id",
    "full_name",
    "email",
    "subject",
    "term",
    "committed_hours",
    "session_count",
}
SESSION_KEYS = {
    "id",
    "starts_at",
    "ends_at",
    "subject",
    "term",
    "monitor",
    "topics",
    "students",
    "duration_minutes",
}
STUDENT_KEYS = {"full_name", "session_count", "last_attended_at"}
TOPIC_KEYS = {"id", "name", "subject", "session_count"}


def course_url(course: Course | int) -> str:
    pk = course.pk if isinstance(course, Course) else course
    return f"{COURSES_URL}{pk}/"


def named(email: str, role: str, first: str, last: str) -> User:
    return make_user(email, role, first_name=first, last_name=last)


def held_session(
    monitor: User,
    subject: Subject,
    term: AcademicTerm,
    hours_ago: int,
    topics: list[Any],
    attendees: list[tuple[User, AttendanceStatus]],
) -> TutoringSession:
    """A recorded session with its topics and the attendance of each student."""
    slot = make_started_slot(monitor, subject, term, hours_ago, capacity=5)
    session = make_session(slot)
    session.topics.set(topics)
    for student, attendance in attendees:
        attend(session, make_reservation(slot, student), attendance)
    return session


@pytest.fixture
def world() -> dict[str, Any]:
    """Two teachers with one current course each, plus a previous-term course of Laura.

    Laura teaches Cálculo (group 1, current term); Pedro teaches Álgebra. Sofía monitors
    Cálculo, Juan monitors Álgebra. Ana attends two Cálculo sessions, Luis one, and Marta
    misses one (NO_SHOW).
    """
    term = current_term()
    today = term.start_date + timedelta(days=30)
    previous = make_term("2026-1", today - timedelta(days=200), today - timedelta(days=100))
    calculo = make_subject("1000004", "Cálculo Diferencial")
    algebra = make_subject("1000003", "Álgebra Lineal")
    fisica = make_subject("1000019", "Física Mecánica")

    laura = named("laura.rojas@unal.edu.co", Role.Code.TEACHER, "Laura", "Rojas")
    pedro = named("pedro.mora@unal.edu.co", Role.Code.TEACHER, "Pedro", "Mora")
    sofia = named("sofia.diaz@unal.edu.co", Role.Code.MONITOR, "Sofía", "Díaz")
    juan = named("juan.ruiz@unal.edu.co", Role.Code.MONITOR, "Juan", "Ruiz")
    make_assignment(sofia, calculo, term, committed_hours=6)
    make_assignment(juan, algebra, term, committed_hours=4)
    make_assignment(juan, fisica, previous, committed_hours=3)

    course = make_course(calculo, term, "1", laura)
    foreign = make_course(algebra, term, "1", pedro)
    old_course = make_course(fisica, previous, "2", laura)

    ana = make_student("ana.perez@unal.edu.co", first_name="Ana", last_name="Pérez")
    luis = make_student("luis.gomez@unal.edu.co", first_name="Luis", last_name="Gómez")
    marta = make_student("marta.rios@unal.edu.co", first_name="Marta", last_name="Ríos")
    carlos = make_student("carlos.vega@unal.edu.co", first_name="Carlos", last_name="Vega")

    limites = make_topic(calculo, "Límites laterales")
    derivadas = make_topic(calculo, "Derivadas")
    matrices = make_topic(algebra, "Matrices")
    vectores = make_topic(fisica, "Vectores")
    attended, missed = AttendanceStatus.ATTENDED, AttendanceStatus.NO_SHOW

    recent = held_session(
        sofia, calculo, term, 2, [limites, derivadas], [(ana, attended), (luis, attended)]
    )
    older = held_session(sofia, calculo, term, 30, [limites], [(ana, attended), (marta, missed)])
    algebra_session = held_session(juan, algebra, term, 3, [matrices], [(carlos, attended)])
    old_session = held_session(juan, fisica, previous, 26, [vectores], [(carlos, attended)])
    # RF-062: an individual evaluation must never reach the teacher either.
    make_evaluation(recent, ana, rating=2, comment="Comentario privado de Ana")

    return {
        "term": term,
        "previous": previous,
        "calculo": calculo,
        "algebra": algebra,
        "laura": laura,
        "pedro": pedro,
        "sofia": sofia,
        "juan": juan,
        "course": course,
        "foreign": foreign,
        "old_course": old_course,
        "ana": ana,
        "luis": luis,
        "marta": marta,
        "carlos": carlos,
        "limites": limites,
        "derivadas": derivadas,
        "recent": recent,
        "older": older,
        "algebra_session": algebra_session,
        "old_session": old_session,
    }


def get(user: User, url: str, params: dict[str, Any] | None = None) -> Any:
    return client_for(user).get(url, params or {})


def moment(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def results(response: Any) -> list[dict[str, Any]]:
    assert response.status_code == 200, response.json()
    return list(response.json()["results"])


# --- Role (T-08.8, RNF-SEC-004) -----------------------------------------------------------


@pytest.mark.parametrize("url", LIST_URLS)
def test_rnf_sec_teaching_requires_authentication(world: dict[str, Any], url: str) -> None:
    assert APIClient().get(url).status_code == 401


@pytest.mark.parametrize("url", LIST_URLS)
@pytest.mark.parametrize("role", [Role.Code.STUDENT, Role.Code.MONITOR, Role.Code.ADMIN])
def test_t_08_8_only_teachers_read_the_follow_up(
    world: dict[str, Any], url: str, role: str
) -> None:
    other = make_user(f"{role.lower()}@unal.edu.co", role)

    response = get(other, url)

    assert response.status_code == 403
    assert "type" in response.json()


@pytest.mark.parametrize("role", [Role.Code.STUDENT, Role.Code.MONITOR, Role.Code.ADMIN])
def test_t_08_8_only_teachers_read_a_course(world: dict[str, Any], role: str) -> None:
    other = make_user(f"{role.lower()}@unal.edu.co", role)

    assert get(other, course_url(world["course"])).status_code == 403


@pytest.mark.parametrize("url", LIST_URLS)
def test_t_08_8_the_follow_up_is_read_only(world: dict[str, Any], url: str) -> None:
    client = client_for(world["laura"])

    for method in (client.post, client.put, client.patch, client.delete):
        assert method(url, {}, format="json").status_code == 405


def test_t_08_8_a_course_is_read_only(world: dict[str, Any]) -> None:
    client = client_for(world["laura"])
    url = course_url(world["course"])

    for method in (client.post, client.put, client.patch, client.delete):
        assert method(url, {}, format="json").status_code == 405


# --- Another teacher's course (T-08.2, CA-HU09-3, RN-009.1) -------------------------------


@pytest.mark.parametrize("url", FILTERED_URLS)
def test_t_08_2_ca_hu09_3_another_teachers_course_is_forbidden(
    world: dict[str, Any], url: str
) -> None:
    response = get(world["laura"], url, {"course": world["foreign"].pk})

    assert response.status_code == 403
    assert response.json()["detail"] == FOREIGN_COURSE_MESSAGE


def test_t_08_2_ca_hu09_3_another_teachers_course_detail_is_forbidden(
    world: dict[str, Any],
) -> None:
    response = get(world["laura"], course_url(world["foreign"]))

    assert response.status_code == 403
    assert response.json()["detail"] == FOREIGN_COURSE_MESSAGE


@pytest.mark.parametrize("url", FILTERED_URLS)
def test_t_08_2_a_course_without_teacher_is_forbidden(world: dict[str, Any], url: str) -> None:
    orphan = make_course(world["calculo"], world["term"], "9")

    assert get(world["laura"], url, {"course": orphan.pk}).status_code == 403
    assert get(world["laura"], course_url(orphan)).status_code == 403


@pytest.mark.parametrize("url", FILTERED_URLS)
def test_t_08_2_an_unknown_course_reads_as_forbidden(world: dict[str, Any], url: str) -> None:
    """Never reveals whether a course id exists: unknown and foreign answer the same."""
    assert get(world["laura"], url, {"course": 999_999}).status_code == 403
    assert get(world["laura"], course_url(999_999)).status_code == 403


def test_t_08_2_the_other_teacher_reads_their_own_course(world: dict[str, Any]) -> None:
    rows = results(get(world["pedro"], SESSIONS_URL, {"course": world["foreign"].pk}))

    assert [row["id"] for row in rows] == [str(world["algebra_session"].pk)]


@pytest.mark.parametrize("url", FILTERED_URLS)
def test_t_08_2_invalid_filters_are_rejected(world: dict[str, Any], url: str) -> None:
    assert get(world["laura"], url, {"course": "abc"}).status_code == 400
    assert get(world["laura"], url, {"term": "2030-2"}).status_code == 400


# --- Courses (panel selector and indicators) ------------------------------------------------


def test_courses_list_only_the_teachers_courses_of_the_current_term(
    world: dict[str, Any],
) -> None:
    rows = results(get(world["laura"], COURSES_URL))

    assert len(rows) == 1
    assert set(rows[0]) == COURSE_KEYS
    assert rows[0]["id"] == world["course"].pk
    assert rows[0]["subject"] == {
        "id": world["calculo"].pk,
        "code": "1000004",
        "name": "Cálculo Diferencial",
    }
    assert rows[0]["term"] == world["term"].code
    assert rows[0]["group"] == "1"
    # 2 sessions; Ana and Luis attended (Marta missed); Sofía is the only monitor.
    assert (rows[0]["monitor_count"], rows[0]["session_count"], rows[0]["student_count"]) == (
        1,
        2,
        2,
    )


def test_courses_switch_term(world: dict[str, Any]) -> None:
    rows = results(get(world["laura"], COURSES_URL, {"term": world["previous"].code}))

    assert [row["id"] for row in rows] == [world["old_course"].pk]
    assert (rows[0]["session_count"], rows[0]["student_count"]) == (1, 1)


def test_courses_reject_unknown_term(world: dict[str, Any]) -> None:
    assert get(world["laura"], COURSES_URL, {"term": "2030-2"}).status_code == 400


def test_course_detail_shows_the_indicators_of_an_own_course(world: dict[str, Any]) -> None:
    response = get(world["laura"], course_url(world["old_course"]))

    assert response.status_code == 200
    data = response.json()
    assert set(data) == COURSE_KEYS
    assert (data["term"], data["monitor_count"], data["session_count"]) == ("2026-1", 1, 1)


def test_t_08_7_a_teacher_without_courses_gets_an_empty_list(world: dict[str, Any]) -> None:
    newcomer = named("nuevo@unal.edu.co", Role.Code.TEACHER, "Nuevo", "Docente")

    for url in LIST_URLS:
        response = get(newcomer, url)
        assert response.status_code == 200
        assert response.json()["count"] == 0


def test_t_08_7_without_any_term_everything_is_empty() -> None:
    teacher = named("solo@unal.edu.co", Role.Code.TEACHER, "Solo", "Docente")

    for url in LIST_URLS:
        assert results(get(teacher, url)) == []


# --- Monitors (T-08.1, CA-HU09-1, RF-080) --------------------------------------------------


def test_t_08_1_ca_hu09_1_a_teacher_sees_only_the_monitors_of_their_courses(
    world: dict[str, Any],
) -> None:
    rows = results(get(world["laura"], MONITORS_URL))

    assert len(rows) == 1
    row = rows[0]
    assert set(row) == MONITOR_KEYS
    sofia = world["sofia"]
    assert (row["id"], row["full_name"], row["email"]) == (
        str(sofia.pk),
        "Sofía Díaz",
        "sofia.diaz@unal.edu.co",
    )
    assert row["subject"]["code"] == "1000004"
    assert (row["term"], row["committed_hours"], row["session_count"]) == ("2026-2", 6, 2)


def test_t_08_1_the_other_teacher_sees_their_own_monitor(world: dict[str, Any]) -> None:
    rows = results(get(world["pedro"], MONITORS_URL))

    assert [row["email"] for row in rows] == ["juan.ruiz@unal.edu.co"]


def test_t_08_1_monitors_of_one_course_and_of_another_term(world: dict[str, Any]) -> None:
    by_course = results(get(world["laura"], MONITORS_URL, {"course": world["old_course"].pk}))
    by_term = results(get(world["laura"], MONITORS_URL, {"term": "2026-1"}))

    assert [(r["email"], r["term"], r["session_count"]) for r in by_course] == [
        ("juan.ruiz@unal.edu.co", "2026-1", 1)
    ]
    assert by_term == by_course


def test_t_08_1_a_monitor_of_two_groups_appears_once(world: dict[str, Any]) -> None:
    make_course(world["calculo"], world["term"], "2", world["laura"])

    rows = results(get(world["laura"], MONITORS_URL))

    assert [row["email"] for row in rows] == ["sofia.diaz@unal.edu.co"]


# --- Sessions (T-08.3, T-08.4, CA-HU09-2, RF-081) ------------------------------------------


def test_t_08_3_ca_hu09_2_sessions_show_date_monitor_students_and_topics(
    world: dict[str, Any],
) -> None:
    rows = results(get(world["laura"], SESSIONS_URL))

    assert [row["id"] for row in rows] == [str(world["recent"].pk), str(world["older"].pk)]
    row = rows[0]
    assert set(row) == SESSION_KEYS
    slot = world["recent"].slot
    assert (moment(row["starts_at"]), moment(row["ends_at"])) == (slot.starts_at, slot.ends_at)
    assert row["monitor"] == {"id": str(world["sofia"].pk), "full_name": "Sofía Díaz"}
    assert row["subject"]["code"] == "1000004"
    assert row["term"] == "2026-2"
    assert sorted(topic["name"] for topic in row["topics"]) == ["Derivadas", "Límites laterales"]
    assert row["students"] == [{"full_name": "Ana Pérez"}, {"full_name": "Luis Gómez"}]
    assert row["duration_minutes"] == 60


def test_t_08_3_only_students_who_attended_are_listed(world: dict[str, Any]) -> None:
    rows = results(get(world["laura"], SESSIONS_URL))

    assert rows[1]["students"] == [{"full_name": "Ana Pérez"}]


def test_t_08_3_sessions_of_another_subject_never_leak(world: dict[str, Any]) -> None:
    ids = {row["id"] for row in results(get(world["laura"], SESSIONS_URL))}

    assert str(world["algebra_session"].pk) not in ids
    assert str(world["old_session"].pk) not in ids


def test_t_08_4_sessions_filtered_by_course(world: dict[str, Any]) -> None:
    rows = results(get(world["laura"], SESSIONS_URL, {"course": world["old_course"].pk}))

    assert [row["id"] for row in rows] == [str(world["old_session"].pk)]


def test_t_08_4_sessions_filtered_by_term(world: dict[str, Any]) -> None:
    rows = results(get(world["laura"], SESSIONS_URL, {"term": "2026-1"}))

    assert [row["id"] for row in rows] == [str(world["old_session"].pk)]


def test_t_08_4_course_filter_wins_over_term(world: dict[str, Any]) -> None:
    rows = results(
        get(world["laura"], SESSIONS_URL, {"course": world["course"].pk, "term": "2026-1"})
    )

    assert len(rows) == 2


def test_t_08_4_sessions_filtered_by_local_date_range(world: dict[str, Any]) -> None:
    recent_day = world["recent"].slot.starts_at.astimezone(LOCAL_TZ).date()
    older_day = world["older"].slot.starts_at.astimezone(LOCAL_TZ).date()
    assert older_day < recent_day

    only_older = results(
        get(
            world["laura"],
            SESSIONS_URL,
            {"date_from": older_day.isoformat(), "date_to": older_day.isoformat()},
        )
    )
    from_recent = results(get(world["laura"], SESSIONS_URL, {"date_from": recent_day}))
    until_older = results(get(world["laura"], SESSIONS_URL, {"date_to": older_day}))

    assert [row["id"] for row in only_older] == [str(world["older"].pk)]
    assert [row["id"] for row in from_recent] == [str(world["recent"].pk)]
    assert [row["id"] for row in until_older] == [str(world["older"].pk)]


def test_t_08_4_an_inverted_date_range_is_rejected(world: dict[str, Any]) -> None:
    response = get(
        world["laura"], SESSIONS_URL, {"date_from": "2026-09-02", "date_to": "2026-09-01"}
    )

    assert response.status_code == 400
    assert response.json()["errors"]["date_to"] == [
        "La fecha final no puede ser anterior a la inicial."
    ]


def test_t_08_4_an_invalid_date_is_rejected(world: dict[str, Any]) -> None:
    assert get(world["laura"], SESSIONS_URL, {"date_from": "ayer"}).status_code == 400


def test_t_08_12_sessions_are_paginated(world: dict[str, Any]) -> None:
    response = get(world["laura"], SESSIONS_URL, {"page_size": 1, "page": 2})

    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 2
    assert [row["id"] for row in data["results"]] == [str(world["older"].pk)]


# --- Students (T-08.5, RF-082) --------------------------------------------------------------


def test_t_08_5_attended_students_are_counted_once(world: dict[str, Any]) -> None:
    response = get(world["laura"], STUDENTS_URL)

    assert response.status_code == 200
    data = response.json()
    # Ana attended twice, Luis once; Marta missed her session.
    assert data["count"] == 2
    rows = data["results"]
    assert all(set(row) == STUDENT_KEYS for row in rows)
    assert [(row["full_name"], row["session_count"]) for row in rows] == [
        ("Ana Pérez", 2),
        ("Luis Gómez", 1),
    ]
    assert moment(rows[0]["last_attended_at"]) == world["recent"].slot.starts_at


def test_t_08_5_a_student_of_two_groups_is_still_counted_once(world: dict[str, Any]) -> None:
    make_course(world["calculo"], world["term"], "2", world["laura"])

    data = get(world["laura"], STUDENTS_URL).json()
    course_row = results(get(world["laura"], COURSES_URL))[0]

    assert data["count"] == 2
    assert course_row["student_count"] == 2


def test_t_08_5_students_of_one_course(world: dict[str, Any]) -> None:
    rows = results(get(world["laura"], STUDENTS_URL, {"course": world["old_course"].pk}))

    assert [(row["full_name"], row["session_count"]) for row in rows] == [("Carlos Vega", 1)]


# --- Frequent topics (T-08.6, CA-HU09-4, RN-009.2, RF-083 confirmed) -----------------------


def test_t_08_6_ca_hu09_4_topics_grouped_and_ordered_by_frequency(
    world: dict[str, Any],
) -> None:
    rows = results(get(world["laura"], TOPICS_URL))

    assert all(set(row) == TOPIC_KEYS for row in rows)
    assert [(row["name"], row["session_count"]) for row in rows] == [
        ("Límites laterales", 2),
        ("Derivadas", 1),
    ]
    assert rows[0]["id"] == str(world["limites"].pk)
    assert rows[0]["subject"]["code"] == "1000004"


def test_t_08_6_ties_are_broken_by_name(world: dict[str, Any]) -> None:
    extra = make_topic(world["calculo"], "Continuidad")
    world["older"].topics.add(world["derivadas"], extra)

    rows = results(get(world["laura"], TOPICS_URL))

    assert [(row["name"], row["session_count"]) for row in rows] == [
        ("Derivadas", 2),
        ("Límites laterales", 2),
        ("Continuidad", 1),
    ]


def test_t_08_6_topics_of_one_course_and_of_another_term(world: dict[str, Any]) -> None:
    by_course = results(get(world["laura"], TOPICS_URL, {"course": world["old_course"].pk}))
    by_term = results(get(world["laura"], TOPICS_URL, {"term": "2026-1"}))

    assert [(row["name"], row["session_count"]) for row in by_course] == [("Vectores", 1)]
    assert by_term == by_course


def test_t_08_6_topics_of_foreign_sessions_never_count(world: dict[str, Any]) -> None:
    names = [row["name"] for row in results(get(world["laura"], TOPICS_URL))]

    assert "Matrices" not in names


# --- Empty course (T-08.7) ------------------------------------------------------------------


def test_t_08_7_a_course_without_sessions_answers_200_and_empty(world: dict[str, Any]) -> None:
    quimica = make_subject("1000024", "Química General")
    empty = make_course(quimica, world["term"], "1", world["laura"])

    for url in FILTERED_URLS:
        response = get(world["laura"], url, {"course": empty.pk})
        assert response.status_code == 200, url
        assert response.json()["count"] == 0, url

    detail = get(world["laura"], course_url(empty)).json()
    assert (detail["monitor_count"], detail["session_count"], detail["student_count"]) == (
        0,
        0,
        0,
    )


# --- Privacy (T-08.10, RNF-SEC-004, RF-062) -------------------------------------------------


def _student_markers(*students: User) -> list[str]:
    markers: list[str] = []
    for student in students:
        markers += [str(student.pk), student.email]
    return markers


@pytest.mark.parametrize("url", [SESSIONS_URL, STUDENTS_URL])
def test_t_08_10_student_ids_and_emails_never_leave_the_server(
    world: dict[str, Any], url: str
) -> None:
    raw = get(world["laura"], url).content.decode()

    for marker in _student_markers(world["ana"], world["luis"], world["marta"]):
        assert marker not in raw


@pytest.mark.parametrize("url", LIST_URLS)
def test_t_08_10_no_evaluation_or_monitor_notes_reach_the_teacher(
    world: dict[str, Any], url: str
) -> None:
    TutoringSession.objects.filter(pk=world["recent"].pk).update(notes="Nota privada del monitor")

    raw = get(world["laura"], url).content.decode()

    for marker in ("Comentario privado de Ana", "rating", "evaluation", "Nota privada", "notes"):
        assert marker not in raw


def test_t_08_10_missed_attendance_is_not_exposed(world: dict[str, Any]) -> None:
    raw = get(world["laura"], SESSIONS_URL).content.decode()

    assert "Marta" not in raw
    assert "NO_SHOW" not in raw


# --- Query count (T-08.9, RNF-PER-002) ------------------------------------------------------


def _grow(world: dict[str, Any], count: int) -> None:
    """More sessions, students and topics in Laura's course, and one more monitor."""
    for index in range(count):
        student = make_student(
            f"extra{index}@unal.edu.co", first_name="Extra", last_name=str(index)
        )
        topic = make_topic(world["calculo"], f"Tema {index}")
        held_session(
            world["sofia"],
            world["calculo"],
            world["term"],
            50 + index * 2,
            [topic, world["limites"]],
            [(student, AttendanceStatus.ATTENDED), (world["ana"], AttendanceStatus.ATTENDED)],
        )
    monitor = named("otro.monitor@unal.edu.co", Role.Code.MONITOR, "Otro", "Monitor")
    make_assignment(monitor, world["calculo"], world["term"])
    make_course(world["calculo"], world["term"], "3", world["laura"])


@pytest.mark.parametrize(
    "request_for",
    [
        pytest.param(lambda w: (COURSES_URL, {}), id="courses"),
        pytest.param(lambda w: (course_url(w["course"]), {}), id="course-detail"),
        pytest.param(lambda w: (MONITORS_URL, {}), id="monitors"),
        pytest.param(lambda w: (SESSIONS_URL, {}), id="sessions"),
        pytest.param(lambda w: (SESSIONS_URL, {"course": w["course"].pk}), id="sessions-course"),
        pytest.param(lambda w: (STUDENTS_URL, {}), id="students"),
        pytest.param(lambda w: (TOPICS_URL, {"course": w["course"].pk}), id="topics-course"),
    ],
)
def test_t_08_9_query_count_does_not_grow_with_rows(
    world: dict[str, Any],
    request_for: Callable[[dict[str, Any]], tuple[str, dict[str, Any]]],
) -> None:
    client = client_for(world["laura"])
    url, params = request_for(world)
    with CaptureQueriesContext(connection) as few:
        assert client.get(url, params).status_code == 200
    _grow(world, 4)

    with CaptureQueriesContext(connection) as many:
        assert client.get(url, params).status_code == 200

    assert len(many) == len(few)


def test_t_08_9_reading_never_writes(world: dict[str, Any]) -> None:
    before = (TutoringSession.objects.count(), Reservation.objects.count(), Course.objects.count())
    client = client_for(world["laura"])

    with CaptureQueriesContext(connection) as queries:
        for url in [*LIST_URLS, course_url(world["course"])]:
            client.get(url)

    writes = [
        query["sql"]
        for query in queries
        if query["sql"].lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE"))
    ]
    assert writes == []
    after = (TutoringSession.objects.count(), Reservation.objects.count(), Course.objects.count())
    assert after == before
