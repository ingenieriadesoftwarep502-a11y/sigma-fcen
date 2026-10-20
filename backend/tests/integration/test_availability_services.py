"""Availability use cases: publish, edit, withdraw and weekly templates (T-03.5 to T-03.7).

CA-HU05-1 to CA-HU05-5, RN-003, ADR-010.
"""

from datetime import date, datetime, time, timedelta
from typing import Any

import pytest
from django.db import IntegrityError, connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from apps.academics.models import AcademicTerm
from apps.accounts.models import Role, UserRole
from apps.availability.domain.rules import LOCAL_TZ, SlotRuleError, SlotStatus
from apps.availability.models import AvailabilitySlot, SlotTemplate
from apps.availability.services import (
    SlotConflictError,
    SlotForbiddenError,
    TemplateConflictError,
    cancel_slot,
    create_slot,
    create_template,
    deactivate_template,
    update_slot,
)
from apps.reservations.domain.rules import ReservationStatus
from tests.availability_data import (
    HOUR,
    SLOT_START,
    Owner,
    current_term,
    local_datetime,
    make_assigned_monitor,
    make_slot,
    next_weekday,
)
from tests.catalog_data import make_subject, make_term, make_user
from tests.reservation_data import make_reservation, make_student

pytestmark = pytest.mark.django_db

PLACE: dict[str, Any] = {
    "modality": AvailabilitySlot.Modality.IN_PERSON,
    "location": "Edificio 404, aula 201",
}


def publish(owner: Owner, starts_at: datetime = SLOT_START, **extra: Any) -> AvailabilitySlot:
    monitor, subject, _ = owner
    return create_slot(monitor=monitor, subject=subject, starts_at=starts_at, **{**PLACE, **extra})


# --- T-03.5 create ---------------------------------------------------------------------------


def test_t_03_5_ca_hu05_1_valid_slot_is_created_with_derived_end_and_term() -> None:
    owner = make_assigned_monitor()

    slot = publish(owner, capacity=3)

    assert slot.ends_at == SLOT_START + HOUR
    assert slot.term == owner[2]
    assert slot.status == SlotStatus.AVAILABLE
    assert slot.capacity == 3
    assert slot.template is None


def test_t_03_5_capacity_defaults_to_the_configured_value() -> None:
    assert publish(make_assigned_monitor()).capacity == 1


@pytest.mark.parametrize("offset", [0, 30, -30])
def test_t_03_5_ca_hu05_2_overlapping_slot_raises_a_domain_error(offset: int) -> None:
    owner = make_assigned_monitor()
    publish(owner)

    with pytest.raises(SlotRuleError, match="Se solapa con otra franja tuya") as exc:
        publish(owner, SLOT_START + timedelta(minutes=offset))

    assert exc.value.field == "starts_at"
    assert AvailabilitySlot.objects.count() == 1


def test_t_03_5_concurrent_overlap_caught_by_the_constraint_is_a_domain_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner = make_assigned_monitor()
    publish(owner)
    monkeypatch.setattr("apps.availability.services._ensure_free", lambda *a, **k: None)

    with pytest.raises(SlotRuleError, match="Se solapa con otra franja tuya"):
        publish(owner, SLOT_START + timedelta(minutes=30))

    assert AvailabilitySlot.objects.count() == 1


def test_t_03_5_other_integrity_errors_are_not_reported_as_overlap() -> None:
    with pytest.raises(IntegrityError, match="availability_slot_capacity_positive"):
        publish(make_assigned_monitor(), capacity=0)


def test_t_03_5_touching_slot_is_allowed() -> None:
    owner = make_assigned_monitor()
    publish(owner)

    publish(owner, SLOT_START + HOUR)

    assert AvailabilitySlot.objects.count() == 2


def test_t_03_5_a_cancelled_slot_does_not_block_its_time() -> None:
    owner = make_assigned_monitor()
    cancel_slot(publish(owner))

    publish(owner)

    assert AvailabilitySlot.objects.filter(status=SlotStatus.AVAILABLE).count() == 1


@pytest.mark.parametrize(
    ("starts_at", "message"),
    [
        (SLOT_START - timedelta(days=14), "no puede empezar en el pasado"),
        (SLOT_START + timedelta(minutes=15), "en punto o a la media"),
    ],
)
def test_t_03_5_window_rules_apply(starts_at: datetime, message: str) -> None:
    with pytest.raises(SlotRuleError, match=message):
        publish(make_assigned_monitor(), starts_at)


def test_t_03_5_slot_outside_every_term_is_rejected() -> None:
    owner = make_assigned_monitor()
    after_term = local_datetime(owner[2].end_date + timedelta(days=3), time(10, 0))

    with pytest.raises(SlotRuleError, match="ningún período académico") as exc:
        publish(owner, after_term)
    assert exc.value.field == "starts_at"


def test_t_03_5_inactive_subject_admits_no_new_slots() -> None:
    owner = make_assigned_monitor()
    owner[1].is_active = False
    owner[1].save()

    with pytest.raises(SlotRuleError, match="inactiva") as exc:
        publish(owner)
    assert exc.value.field == "subject"


# --- T-03.6 authorization by assigned subject ------------------------------------------------


def test_t_03_6_ca_hu05_5_unassigned_subject_is_forbidden() -> None:
    monitor, _, _ = make_assigned_monitor()
    other = make_subject("1000005", "Álgebra Lineal")

    with pytest.raises(SlotForbiddenError, match="No tienes asignada"):
        create_slot(monitor=monitor, subject=other, starts_at=SLOT_START, **PLACE)


def test_t_03_6_assignment_in_another_term_is_not_enough() -> None:
    old = make_term("2025-2", date(2025, 8, 1), date(2025, 12, 1))
    monitor, subject, _ = make_assigned_monitor(term=old)
    current_term()

    with pytest.raises(SlotForbiddenError):
        create_slot(monitor=monitor, subject=subject, starts_at=SLOT_START, **PLACE)


def test_t_03_6_rn_002_revoked_monitor_role_is_forbidden() -> None:
    owner = make_assigned_monitor()
    UserRole.objects.filter(user=owner[0], role__code=Role.Code.MONITOR).delete()

    with pytest.raises(SlotForbiddenError):
        publish(owner)


# --- update ----------------------------------------------------------------------------------


def test_update_moves_the_slot_and_recomputes_its_end() -> None:
    owner = make_assigned_monitor()
    slot = publish(owner)

    update_slot(slot, {"starts_at": SLOT_START + 2 * HOUR, "location": "Aula virtual"})

    slot.refresh_from_db()
    assert slot.starts_at == SLOT_START + 2 * HOUR
    assert slot.ends_at == SLOT_START + 3 * HOUR
    assert slot.location == "Aula virtual"


def test_update_does_not_collide_with_itself() -> None:
    slot = publish(make_assigned_monitor())

    update_slot(slot, {"starts_at": SLOT_START + timedelta(minutes=30)})

    slot.refresh_from_db()
    assert slot.starts_at == SLOT_START + timedelta(minutes=30)


def test_update_onto_another_slot_is_rejected() -> None:
    owner = make_assigned_monitor()
    slot = publish(owner)
    publish(owner, SLOT_START + 2 * HOUR)

    with pytest.raises(SlotRuleError, match="Se solapa"):
        update_slot(slot, {"starts_at": SLOT_START + 2 * HOUR})


@pytest.mark.parametrize("status", [SlotStatus.CANCELLED, SlotStatus.EXPIRED])
def test_rn_003_4_withdrawn_or_expired_slots_cannot_be_edited(status: SlotStatus) -> None:
    slot = make_slot(*make_assigned_monitor(), status=status)

    with pytest.raises(SlotConflictError):
        update_slot(slot, {"location": "Otra aula"})


# --- T-03.7 withdraw -------------------------------------------------------------------------


def test_t_03_7_ca_hu05_3_withdrawing_cancels_and_keeps_the_row() -> None:
    slot = publish(make_assigned_monitor())

    cancel_slot(slot)

    slot.refresh_from_db()
    assert slot.status == SlotStatus.CANCELLED


def test_t_03_7_ca_hu05_4_reserved_slot_cannot_be_withdrawn() -> None:
    slot = make_slot(*make_assigned_monitor(), status=SlotStatus.RESERVED)
    make_reservation(slot, make_student())

    with pytest.raises(SlotConflictError, match="reserva"):
        cancel_slot(slot)

    slot.refresh_from_db()
    assert slot.status == SlotStatus.RESERVED


def test_t_03_7_already_cancelled_slot_cannot_be_withdrawn_again() -> None:
    slot = make_slot(*make_assigned_monitor(), status=SlotStatus.CANCELLED)

    with pytest.raises(SlotConflictError):
        cancel_slot(slot)


# --- Weekly template (ADR-010, condition c) --------------------------------------------------


def short_term() -> AcademicTerm:
    today = timezone.localdate(timezone=LOCAL_TZ)
    return make_term("2026-2", today - timedelta(days=10), today + timedelta(days=20))


def expected_days(term: AcademicTerm, weekday: int, at: time) -> list[date]:
    now = timezone.now()
    day, days = term.start_date, []
    while day <= term.end_date:
        if day.weekday() == weekday and local_datetime(day, at) > now:
            days.append(day)
        day += timedelta(days=1)
    return days


def make_template(
    owner: Owner, weekday: int = 1, at: time = time(10, 0), **extra: Any
) -> SlotTemplate:
    monitor, subject, term = owner
    return create_template(
        monitor=monitor,
        subject=subject,
        term=term,
        weekday=weekday,
        start_time=at,
        **{**PLACE, **extra},
    )


def test_template_generates_one_slot_per_remaining_week_of_the_term() -> None:
    owner = make_assigned_monitor(term=short_term())

    template = make_template(owner, capacity=2)

    slots = list(template.slots.order_by("starts_at"))
    assert [s.starts_at.astimezone(LOCAL_TZ).date() for s in slots] == expected_days(
        owner[2], 1, time(10, 0)
    )
    assert all(s.starts_at.astimezone(LOCAL_TZ).time() == time(10, 0) for s in slots)
    assert all(s.ends_at - s.starts_at == HOUR for s in slots)
    assert all(s.capacity == 2 and s.term == owner[2] for s in slots)


def test_template_with_a_conflict_creates_nothing_and_lists_the_dates() -> None:
    owner = make_assigned_monitor(term=short_term())
    clash = local_datetime(next_weekday(1), time(10, 30))
    make_slot(*owner, clash)

    with pytest.raises(TemplateConflictError) as exc:
        make_template(owner)

    assert exc.value.dates == [clash.date()]
    assert SlotTemplate.objects.count() == 0
    assert AvailabilitySlot.objects.count() == 1


@pytest.mark.parametrize("at", [time(10, 15), time(10, 0, 30)])
def test_template_start_must_be_on_the_hour_or_half_hour(at: time) -> None:
    with pytest.raises(SlotRuleError, match="en punto o a la media") as exc:
        make_template(make_assigned_monitor(term=short_term()), at=at)
    assert exc.value.field == "start_time"


def test_template_requires_the_assignment() -> None:
    term = short_term()
    monitor = make_user("sin@unal.edu.co", Role.Code.MONITOR)

    with pytest.raises(SlotForbiddenError):
        make_template((monitor, make_subject(), term))


def test_template_on_a_finished_term_is_rejected() -> None:
    finished = make_term("2025-1", date(2025, 2, 1), date(2025, 6, 1))

    with pytest.raises(SlotRuleError, match="no tiene semanas restantes"):
        make_template(make_assigned_monitor(term=finished))


def test_deactivating_a_template_cancels_only_its_future_available_slots() -> None:
    owner = make_assigned_monitor(term=short_term())
    template = make_template(owner)
    first, *rest = template.slots.order_by("starts_at")
    first.transition_to(SlotStatus.RESERVED)
    make_reservation(first, make_student())
    loose = publish(owner, local_datetime(next_weekday(3), time(8, 0)))

    deactivate_template(template)

    template.refresh_from_db()
    first.refresh_from_db()
    loose.refresh_from_db()
    assert not template.is_active
    assert first.status == SlotStatus.RESERVED
    assert loose.status == SlotStatus.AVAILABLE
    assert all(
        s.status == SlotStatus.CANCELLED
        for s in AvailabilitySlot.objects.filter(pk__in=[s.pk for s in rest])
    )


# --- T-04.21 · monitor restrictions by CONFIRMED count (ADR-010 R2, CA-HU05-4, RN-003.4) -----


def group_slot_with(seats: int, capacity: int = 3, **extra: Any) -> AvailabilitySlot:
    """A group slot holding `seats` CONFIRMED reservations; still AVAILABLE while not full."""
    status = SlotStatus.RESERVED if seats >= capacity else SlotStatus.AVAILABLE
    slot = make_slot(*make_assigned_monitor(), capacity=capacity, status=status, **extra)
    for seat in range(seats):
        make_reservation(slot, make_student(f"estudiante{seat}@unal.edu.co"))
    return slot


def test_t_04_21_group_slot_with_one_reservation_cannot_be_withdrawn() -> None:
    slot = group_slot_with(1)

    with pytest.raises(SlotConflictError, match="reserva"):
        cancel_slot(slot)

    slot.refresh_from_db()
    assert slot.status == SlotStatus.AVAILABLE


def test_t_04_21_group_slot_with_one_reservation_cannot_move_its_start() -> None:
    slot = group_slot_with(1)

    with pytest.raises(SlotConflictError, match="reserva"):
        update_slot(slot, {"starts_at": SLOT_START + timedelta(minutes=30)})

    slot.refresh_from_db()
    assert slot.starts_at == SLOT_START


def test_t_04_21_place_of_a_slot_with_reservations_can_still_change() -> None:
    slot = group_slot_with(1)

    update_slot(slot, {"location": "Otra aula", "modality": AvailabilitySlot.Modality.VIRTUAL})

    slot.refresh_from_db()
    assert slot.location == "Otra aula"


def test_t_04_21_capacity_cannot_drop_below_the_confirmed_reservations() -> None:
    slot = group_slot_with(2)

    with pytest.raises(SlotConflictError, match="cupos"):
        update_slot(slot, {"capacity": 1})

    slot.refresh_from_db()
    assert slot.capacity == 3


def test_t_04_21_lowering_capacity_to_the_reservations_fills_the_slot() -> None:
    slot = group_slot_with(2)

    update_slot(slot, {"capacity": 2})

    slot.refresh_from_db()
    assert (slot.capacity, slot.status) == (2, SlotStatus.RESERVED)


def test_t_04_21_raising_capacity_of_a_full_slot_reopens_it() -> None:
    slot = group_slot_with(2, capacity=2)

    update_slot(slot, {"capacity": 4})

    slot.refresh_from_db()
    assert (slot.capacity, slot.status) == (4, SlotStatus.AVAILABLE)


def test_t_04_21_cancelled_reservations_do_not_block_the_monitor() -> None:
    slot = make_slot(*make_assigned_monitor(), capacity=3)
    make_reservation(slot, make_student(), status=ReservationStatus.CANCELLED)

    cancel_slot(slot)

    slot.refresh_from_db()
    assert slot.status == SlotStatus.CANCELLED


def test_t_04_21_deactivating_a_template_keeps_slots_with_any_reservation() -> None:
    owner = make_assigned_monitor(term=short_term())
    template = make_template(owner, capacity=3)
    first, *rest = template.slots.order_by("starts_at")
    make_reservation(first, make_student())

    deactivate_template(template)

    first.refresh_from_db()
    assert first.status == SlotStatus.AVAILABLE
    assert all(
        s.status == SlotStatus.CANCELLED
        for s in AvailabilitySlot.objects.filter(pk__in=[s.pk for s in rest])
    )


def test_t_04_21_withdrawal_locks_the_slot_row_before_counting() -> None:
    """The count runs under the same lock the reservation service takes (FASE-04 §6)."""
    slot = make_slot(*make_assigned_monitor())

    with CaptureQueriesContext(connection) as queries:
        cancel_slot(slot)

    sqls = [query["sql"] for query in queries.captured_queries]
    lock = next(i for i, sql in enumerate(sqls) if "FOR UPDATE" in sql)
    count = next(i for i, sql in enumerate(sqls) if '"reservations_reservation"' in sql)
    assert lock < count
