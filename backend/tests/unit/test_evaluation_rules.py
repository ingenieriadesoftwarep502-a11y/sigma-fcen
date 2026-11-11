"""Pure evaluation rules (T-06.2, T-06.3, T-06.6, T-06.8, RN-007, confirmed 2026-11-10)."""

import pytest

from apps.evaluations.domain.rules import (
    MAX_COMMENT_LENGTH,
    RATING_MAX,
    RATING_MIN,
    EvaluationRuleError,
    clean_comment,
    ensure_attended,
    ensure_rating,
    published_average,
)
from apps.tutoring_sessions.domain.rules import AttendanceStatus

# --- T-06.2 · scale (CA-HU07-4, RN-007.4) ------------------------------------------------------


def test_t_06_2_the_confirmed_scale_is_one_to_five() -> None:
    assert (RATING_MIN, RATING_MAX) == (1, 5)


@pytest.mark.parametrize("rating", [1, 3, 5])
def test_t_06_2_ratings_inside_the_scale_are_accepted(rating: int) -> None:
    ensure_rating(rating)


@pytest.mark.parametrize("rating", [0, 6, -1, 10])
def test_t_06_2_ratings_outside_the_scale_are_rejected(rating: int) -> None:
    with pytest.raises(EvaluationRuleError) as exc:
        ensure_rating(rating)

    assert exc.value.field == "rating"
    assert exc.value.message == "La calificación debe ser un número entero entre 1 y 5."


# --- Comment ---------------------------------------------------------------------------------


def test_comment_is_optional_and_trimmed() -> None:
    assert clean_comment(None) == ""
    assert clean_comment("   ") == ""
    assert clean_comment("  Muy clara.  ") == "Muy clara."


def test_comment_longer_than_the_limit_is_rejected() -> None:
    assert clean_comment("a" * MAX_COMMENT_LENGTH) == "a" * MAX_COMMENT_LENGTH

    with pytest.raises(EvaluationRuleError) as exc:
        clean_comment("a" * (MAX_COMMENT_LENGTH + 1))

    assert exc.value.field == "comment"


# --- T-06.3, T-06.6 · only attended sessions (RN-007.1, RN-007.3) -------------------------------


def test_t_06_3_an_attended_session_can_be_evaluated() -> None:
    ensure_attended(AttendanceStatus.ATTENDED)


def test_t_06_6_ca_hu07_5_a_no_show_cannot_be_evaluated() -> None:
    with pytest.raises(EvaluationRuleError) as exc:
        ensure_attended(AttendanceStatus.NO_SHOW)

    assert exc.value.field == "session_id"


# --- T-06.8 · publication threshold (RN-007.5) ---------------------------------------------------


def test_t_06_8_below_the_minimum_there_is_no_average() -> None:
    assert published_average(4.0, 1, minimum=2) is None
    assert published_average(None, 0, minimum=2) is None


def test_t_06_8_from_the_minimum_the_average_is_published() -> None:
    assert published_average(4.5, 2, minimum=2) == 4.5
    assert published_average(3.67, 3, minimum=2) == 3.67
