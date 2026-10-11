"""AvailabilitySlot invariants enforced by the database (T-03.4, DDD section 4.3, RN-003)."""

from datetime import timedelta

import pytest
from django.db import DatabaseError, transaction

from apps.availability.domain.rules import SlotRuleError, SlotStatus
from apps.availability.models import AvailabilitySlot
from tests.availability_data import HOUR, SLOT_START, make_assigned_monitor, make_slot

pytestmark = pytest.mark.django_db


def _rejected(create: object) -> None:
    with pytest.raises(DatabaseError), transaction.atomic():
        create()  # type: ignore[operator]


def test_t_03_4_new_slot_defaults_to_available_capacity_one_in_person() -> None:
    slot = make_slot(*make_assigned_monitor())

    slot.refresh_from_db()
    assert slot.status == SlotStatus.AVAILABLE
    assert slot.capacity == 1
    assert slot.modality == AvailabilitySlot.Modality.IN_PERSON
    assert slot.template is None


def test_rn_003_1_end_not_after_start_is_rejected_by_the_database() -> None:
    owner = make_assigned_monitor()

    _rejected(lambda: make_slot(*owner, ends_at=SLOT_START))


@pytest.mark.parametrize("capacity", [0, 21])
def test_adr_010_capacity_out_of_range_is_rejected(capacity: int) -> None:
    owner = make_assigned_monitor()

    _rejected(lambda: make_slot(*owner, capacity=capacity))


def test_t_03_4_unknown_status_is_rejected() -> None:
    owner = make_assigned_monitor()

    _rejected(lambda: make_slot(*owner, status="BOOKED"))


@pytest.mark.parametrize("offset", [0, 30])
def test_rn_003_3_overlapping_slots_of_the_same_monitor_are_rejected(offset: int) -> None:
    owner = make_assigned_monitor()
    make_slot(*owner)

    _rejected(lambda: make_slot(*owner, SLOT_START + timedelta(minutes=offset)))


def test_rn_003_3_touching_slots_of_the_same_monitor_are_allowed() -> None:
    owner = make_assigned_monitor()
    make_slot(*owner)

    make_slot(*owner, SLOT_START + HOUR)
    make_slot(*owner, SLOT_START - HOUR)

    assert AvailabilitySlot.objects.count() == 3


def test_rn_003_3_other_monitors_may_use_the_same_time() -> None:
    first = make_assigned_monitor("uno@unal.edu.co")
    second = make_assigned_monitor("dos@unal.edu.co")

    make_slot(*first)
    make_slot(*second)

    assert AvailabilitySlot.objects.count() == 2


def test_rn_003_3_a_cancelled_slot_frees_its_time() -> None:
    owner = make_assigned_monitor()
    make_slot(*owner, status=SlotStatus.CANCELLED)

    make_slot(*owner)

    assert AvailabilitySlot.objects.count() == 2


def test_t_03_4_transition_to_validates_and_saves() -> None:
    slot = make_slot(*make_assigned_monitor())

    slot.transition_to(SlotStatus.CANCELLED)

    slot.refresh_from_db()
    assert slot.status == SlotStatus.CANCELLED
    with pytest.raises(SlotRuleError):
        slot.transition_to(SlotStatus.AVAILABLE)
