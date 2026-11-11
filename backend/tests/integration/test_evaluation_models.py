"""Evaluation model and its database guarantees (T-06.1, DDD 4.6, RN-007.2, RN-007.4)."""

import pytest
from django.db import IntegrityError, transaction

from apps.accounts.models import User
from apps.evaluations.models import Evaluation
from apps.tutoring_sessions.models import TutoringSession
from tests.availability_data import make_assigned_monitor
from tests.evaluation_data import attend, make_evaluation
from tests.reservation_data import make_reservation, make_student
from tests.session_data import make_session, make_started_slot

pytestmark = pytest.mark.django_db

Attended = tuple[TutoringSession, User]


@pytest.fixture
def attended() -> Attended:
    monitor, subject, term = make_assigned_monitor()
    slot = make_started_slot(monitor, subject, term, capacity=2)
    session = make_session(slot)
    ana = make_student()
    attend(session, make_reservation(slot, ana))
    return session, ana


def test_t_06_1_rn_007_2_one_evaluation_per_session_and_student(
    attended: Attended,
) -> None:
    session, ana = attended
    make_evaluation(session, ana, 5)

    with pytest.raises(IntegrityError) as exc, transaction.atomic():
        make_evaluation(session, ana, 3)

    assert "evaluations_unique_session_student" in str(exc.value)
    assert Evaluation.objects.count() == 1


@pytest.mark.parametrize("rating", [0, 6])
def test_t_06_1_rn_007_4_the_database_rejects_a_rating_outside_the_scale(
    attended: Attended, rating: int
) -> None:
    session, ana = attended

    with pytest.raises(IntegrityError) as exc, transaction.atomic():
        make_evaluation(session, ana, rating)

    assert "evaluations_rating_range" in str(exc.value)


def test_t_06_1_an_evaluation_keeps_its_author_rating_comment_and_date(
    attended: Attended,
) -> None:
    session, ana = attended

    evaluation = make_evaluation(session, ana, 4, comment="Muy clara.")

    evaluation.refresh_from_db()
    assert evaluation.student == ana
    assert evaluation.session == session
    assert evaluation.rating == 4
    assert evaluation.comment == "Muy clara."
    assert evaluation.created_at is not None
    assert str(evaluation) == f"Evaluación {evaluation.pk}"
