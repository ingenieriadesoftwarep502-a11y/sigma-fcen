"""Pure teacher-follow-up rules (FASE-08: T-08.2, T-08.4, RN-009.1, RF-083 confirmed 2026-11-10)."""

from datetime import date, datetime, time

import pytest

from apps.analytics.domain.rules import (
    FOREIGN_COURSE_MESSAGE,
    FREQUENT_TOPICS_ORDERING,
    TeachingForbiddenError,
    TeachingRuleError,
    ensure_own_course,
    local_day_bounds,
)
from apps.availability.domain.rules import LOCAL_TZ

# --- T-08.2 · another teacher's course (RN-009.1, CA-HU09-3) ----------------------------------


def test_t_08_2_an_own_course_passes() -> None:
    ensure_own_course(owned=True)


def test_t_08_2_a_foreign_course_is_forbidden() -> None:
    with pytest.raises(TeachingForbiddenError) as exc:
        ensure_own_course(owned=False)

    assert (
        exc.value.message == FOREIGN_COURSE_MESSAGE == "Solo puedes consultar tus propios cursos."
    )


# --- T-08.4 · date range of the session filter ----------------------------------------------


def test_t_08_4_no_dates_means_no_bounds() -> None:
    assert local_day_bounds(None, None) == (None, None)


def test_t_08_4_the_range_covers_whole_local_days_end_exclusive() -> None:
    start, end = local_day_bounds(date(2026, 9, 1), date(2026, 9, 30))

    assert start == datetime.combine(date(2026, 9, 1), time(0, 0), tzinfo=LOCAL_TZ)
    assert end == datetime.combine(date(2026, 10, 1), time(0, 0), tzinfo=LOCAL_TZ)


def test_t_08_4_one_day_range_is_valid() -> None:
    start, end = local_day_bounds(date(2026, 9, 1), date(2026, 9, 1))

    assert start is not None and end is not None
    assert (end - start).days == 1


def test_t_08_4_open_ended_ranges_keep_one_bound() -> None:
    assert local_day_bounds(date(2026, 9, 1), None)[1] is None
    assert local_day_bounds(None, date(2026, 9, 1))[0] is None


def test_t_08_4_a_range_that_ends_before_it_starts_is_rejected() -> None:
    with pytest.raises(TeachingRuleError) as exc:
        local_day_bounds(date(2026, 9, 2), date(2026, 9, 1))

    assert exc.value.field == "date_to"
    assert exc.value.message == "La fecha final no puede ser anterior a la inicial."


# --- T-08.6 · RF-083 confirmed: most repeated topics first, deterministic ties ---------------


def test_t_08_6_frequent_topics_order_by_count_then_name_then_id() -> None:
    assert FREQUENT_TOPICS_ORDERING == ("-session_count", "name_key", "id")
