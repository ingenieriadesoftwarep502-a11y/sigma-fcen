"""Evaluation use cases and the monitor's rating (T-06.3 to T-06.8, RN-007, RF-063).

Confirmed 2026-11-10: scale 1 to 5, average published from the 2nd evaluation, evaluations
anonymous to the monitor (RF-062).
"""

from typing import Any

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.accounts.models import Role, UserRole
from apps.evaluations.domain.rules import (
    EvaluationConflictError,
    EvaluationForbiddenError,
    EvaluationRuleError,
)
from apps.evaluations.models import Evaluation
from apps.evaluations.selectors import monitor_rating, pending_evaluations
from apps.evaluations.services import submit_evaluation
from apps.reservations.domain.rules import ReservationStatus
from apps.tutoring_sessions.domain.rules import AttendanceStatus
from tests.availability_data import make_assigned_monitor
from tests.catalog_data import make_subject
from tests.evaluation_data import attend, make_evaluation
from tests.reservation_data import make_reservation, make_student
from tests.session_data import make_session, make_started_slot

pytestmark = pytest.mark.django_db


@pytest.fixture
def world() -> dict[str, Any]:
    sofia, calculo, term = make_assigned_monitor("sofia.diaz@unal.edu.co")
    slot = make_started_slot(sofia, calculo, term, capacity=3)
    session = make_session(slot)
    ana = make_student("ana.perez@unal.edu.co")
    luis = make_student("luis.gomez@unal.edu.co")
    return {
        "sofia": sofia,
        "calculo": calculo,
        "term": term,
        "session": session,
        "ana": ana,
        "luis": luis,
        "ana_reservation": attend(session, make_reservation(slot, ana)),
        "luis_reservation": attend(session, make_reservation(slot, luis), AttendanceStatus.NO_SHOW),
    }


def evaluate(world: dict[str, Any], who: str = "ana", **overrides: Any) -> Evaluation:
    data: dict[str, Any] = {"rating": 5, "comment": "Muy clara."}
    data.update(overrides)
    return submit_evaluation(student=world[who], session=world["session"], **data)


# --- T-06.3 · CA-HU07-1 ------------------------------------------------------------------------


def test_t_06_3_ca_hu07_1_a_student_evaluates_a_session_they_attended(
    world: dict[str, Any],
) -> None:
    evaluation = evaluate(world, rating=4, comment="  Explica muy bien.  ")

    assert evaluation.student == world["ana"]
    assert evaluation.session == world["session"]
    assert evaluation.rating == 4
    assert evaluation.comment == "Explica muy bien."


def test_t_06_3_the_comment_is_optional(world: dict[str, Any]) -> None:
    evaluation = evaluate(world, comment=None)

    assert evaluation.comment == ""


# --- T-06.2 · CA-HU07-4 ------------------------------------------------------------------------


def test_t_06_2_a_rating_outside_the_scale_is_a_rule_error(world: dict[str, Any]) -> None:
    with pytest.raises(EvaluationRuleError) as exc:
        evaluate(world, rating=6)

    assert exc.value.field == "rating"
    assert not Evaluation.objects.exists()


# --- T-06.4 · CA-HU07-2 ------------------------------------------------------------------------


def test_t_06_4_ca_hu07_2_a_second_evaluation_is_a_conflict(world: dict[str, Any]) -> None:
    evaluate(world)

    with pytest.raises(EvaluationConflictError) as exc:
        evaluate(world, rating=1)

    assert exc.value.code == "already_evaluated"
    assert Evaluation.objects.get().rating == 5


def test_t_06_4_a_concurrent_duplicate_still_ends_as_a_conflict(
    world: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    """The lookup lost the race: the unique constraint is the last line of defence."""
    evaluate(world)
    monkeypatch.setattr("apps.evaluations.services._evaluated", lambda *_: False)

    with pytest.raises(EvaluationConflictError) as exc:
        evaluate(world, rating=1)

    assert exc.value.code == "already_evaluated"


# --- T-06.5 · CA-HU07-3 ------------------------------------------------------------------------


def test_t_06_5_ca_hu07_3_a_student_outside_the_session_is_forbidden(
    world: dict[str, Any],
) -> None:
    outsider = make_student("otro@unal.edu.co")

    with pytest.raises(EvaluationForbiddenError):
        submit_evaluation(student=outsider, session=world["session"], rating=5, comment="")


def test_t_06_5_the_monitor_cannot_evaluate_their_own_session(world: dict[str, Any]) -> None:
    with pytest.raises(EvaluationForbiddenError):
        submit_evaluation(student=world["sofia"], session=world["session"], rating=5, comment="")


def test_t_06_5_a_late_cancellation_has_no_session_to_evaluate(world: dict[str, Any]) -> None:
    """ADR-011: the late canceller is NO_SHOW without an attendance row in the session."""
    marta = make_student("marta@unal.edu.co")
    make_reservation(world["session"].slot, marta, status=ReservationStatus.NO_SHOW)

    with pytest.raises(EvaluationForbiddenError):
        submit_evaluation(student=marta, session=world["session"], rating=5, comment="")


def test_t_06_5_rn_002_a_participant_without_the_student_role_is_forbidden(
    world: dict[str, Any],
) -> None:
    UserRole.objects.filter(user=world["ana"], role__code=Role.Code.STUDENT).delete()

    with pytest.raises(EvaluationForbiddenError):
        evaluate(world)


# --- T-06.6 · CA-HU07-5 ------------------------------------------------------------------------


def test_t_06_6_ca_hu07_5_a_no_show_cannot_evaluate(world: dict[str, Any]) -> None:
    with pytest.raises(EvaluationRuleError) as exc:
        evaluate(world, "luis")

    assert exc.value.field == "session_id"
    assert not Evaluation.objects.exists()


# --- T-06.7, T-06.8 · RF-063, RN-007.5 ----------------------------------------------------------


def evaluated_sessions(world: dict[str, Any], ratings: list[int]) -> None:
    """One extra attended session of Sofía per rating, each evaluated by a new student."""
    for index, rating in enumerate(ratings):
        slot = make_started_slot(world["sofia"], world["calculo"], world["term"], 5 + 3 * index)
        session = make_session(slot)
        student = make_student(f"estudiante{index}@unal.edu.co")
        attend(session, make_reservation(slot, student))
        make_evaluation(session, student, rating)


def test_t_06_8_without_evaluations_there_is_no_average(world: dict[str, Any]) -> None:
    rating = monitor_rating(world["sofia"])

    assert rating.count == 0
    assert rating.average is None


def test_t_06_8_rn_007_5_one_evaluation_is_not_enough_to_publish(world: dict[str, Any]) -> None:
    evaluated_sessions(world, [5])

    rating = monitor_rating(world["sofia"])

    assert rating.count == 1
    assert rating.average is None


def test_t_06_7_rf_063_the_average_covers_every_evaluation_of_the_monitor(
    world: dict[str, Any],
) -> None:
    evaluated_sessions(world, [5, 4, 2])
    other, algebra, _ = make_assigned_monitor("otro.monitor@unal.edu.co", make_subject("1000009"))
    other_slot = make_started_slot(other, algebra, world["term"], 40)
    other_session = make_session(other_slot)
    attend(other_session, make_reservation(other_slot, world["ana"]))
    make_evaluation(other_session, world["ana"], 1)

    rating = monitor_rating(world["sofia"])

    assert rating.count == 3
    assert rating.average == pytest.approx(3.67)


def test_t_06_7_the_average_is_one_aggregate_query(world: dict[str, Any]) -> None:
    evaluated_sessions(world, [5, 4, 2, 3])

    with CaptureQueriesContext(connection) as queries:
        rating = monitor_rating(world["sofia"])

    assert rating.average == pytest.approx(3.5)
    assert len(queries) == 1
    assert "AVG" in queries[0]["sql"].upper()


# --- T-06.10 · pending evaluations -------------------------------------------------------------


def test_t_06_10_pending_lists_attended_sessions_not_yet_evaluated(
    world: dict[str, Any],
) -> None:
    assert [r.pk for r in pending_evaluations(world["ana"].pk)] == [world["ana_reservation"].pk]
    assert list(pending_evaluations(world["luis"].pk)) == []

    evaluate(world)

    assert list(pending_evaluations(world["ana"].pk)) == []
