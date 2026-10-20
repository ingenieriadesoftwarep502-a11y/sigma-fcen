"""Real concurrency on the last seat of a slot (T-04.6, T-04.25, CA-HU03-3, RN-004.3).

Each request runs in its own thread, so it gets its own PostgreSQL connection and its own
real transaction (`transaction=True`: no wrapping test transaction is shared). A barrier
releases both requests together, and a short pause after the count keeps the first
transaction holding the slot lock while the second one arrives: the second must block on
SELECT ... FOR UPDATE and then see the committed state. Sequential calls would prove nothing.
"""

import threading
import time
from collections.abc import Callable
from contextlib import suppress
from typing import Any

import pytest
from django.db import connection

from apps.accounts.models import User
from apps.availability.domain.rules import SlotStatus
from apps.availability.models import AvailabilitySlot
from apps.reservations import services
from apps.reservations.domain.rules import ReservationStatus
from tests.availability_data import make_assigned_monitor, make_slot
from tests.catalog_data import client_for
from tests.reservation_data import make_reservation, make_student

pytestmark = pytest.mark.django_db(transaction=True, serialized_rollback=True)

RESERVATIONS_URL = "/api/v1/reservations/"
HOLD_SECONDS = 0.3


def hold_the_lock(monkeypatch: pytest.MonkeyPatch) -> None:
    """Widens the race window: the winner keeps the slot row locked for a moment."""
    count = services._confirmed_count

    def slow_count(slot: AvailabilitySlot) -> int:
        result = count(slot)
        time.sleep(HOLD_SECONDS)
        return result

    monkeypatch.setattr(services, "_confirmed_count", slow_count)


def race(requests: list[Callable[[], Any]]) -> list[Any]:
    """Runs every request at once, each in its own thread, connection and transaction."""
    barrier = threading.Barrier(len(requests), timeout=5)
    results: list[Any] = [None] * len(requests)

    def run(index: int, request: Callable[[], Any]) -> None:
        try:
            with suppress(threading.BrokenBarrierError):
                barrier.wait()
            results[index] = request()
        except Exception as error:  # surfaced through the results, never swallowed
            results[index] = error
        finally:
            connection.close()

    threads = [threading.Thread(target=run, args=pair) for pair in enumerate(requests)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)
    return results


def post_reservation(student: User, slot: AvailabilitySlot) -> Callable[[], int]:
    def request() -> int:
        response = client_for(student).post(RESERVATIONS_URL, {"slot_id": slot.pk}, format="json")
        return response.status_code

    return request


def confirmed(slot: AvailabilitySlot) -> int:
    return slot.reservations.filter(status=ReservationStatus.CONFIRMED).count()


def test_t_04_6_ca_hu03_3_two_students_on_the_last_seat_exactly_one_wins(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    slot = make_slot(*make_assigned_monitor())
    ana, luis = make_student("ana@unal.edu.co"), make_student("luis@unal.edu.co")
    hold_the_lock(monkeypatch)

    statuses = race([post_reservation(ana, slot), post_reservation(luis, slot)])

    assert sorted(statuses) == [201, 409]
    assert confirmed(slot) == 1
    slot.refresh_from_db()
    assert slot.status == SlotStatus.RESERVED


def test_t_04_6_the_loser_blocked_on_the_row_lock(monkeypatch: pytest.MonkeyPatch) -> None:
    """The requests really overlapped: the loser fails without counting, yet it took as long
    as the winner held the lock, because SELECT ... FOR UPDATE made it wait."""
    slot = make_slot(*make_assigned_monitor())
    ana, luis = make_student("ana@unal.edu.co"), make_student("luis@unal.edu.co")
    hold_the_lock(monkeypatch)

    def timed(request: Callable[[], int]) -> Callable[[], tuple[int, float]]:
        def run() -> tuple[int, float]:
            started = time.monotonic()
            return request(), time.monotonic() - started

        return run

    results = race([timed(post_reservation(ana, slot)), timed(post_reservation(luis, slot))])

    loser = next(duration for status, duration in results if status == 409)
    assert loser >= HOLD_SECONDS * 0.8
    assert confirmed(slot) == 1


def test_t_04_25_capacity_two_with_one_taken_admits_exactly_one_more(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    slot = make_slot(*make_assigned_monitor(), capacity=2)
    make_reservation(slot, make_student("eva@unal.edu.co"))
    ana, luis = make_student("ana@unal.edu.co"), make_student("luis@unal.edu.co")
    hold_the_lock(monkeypatch)

    statuses = race([post_reservation(ana, slot), post_reservation(luis, slot)])

    assert sorted(statuses) == [201, 409]
    assert confirmed(slot) == 2
    slot.refresh_from_db()
    assert slot.status == SlotStatus.RESERVED


def test_t_04_25_many_students_never_exceed_the_capacity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    slot = make_slot(*make_assigned_monitor(), capacity=3)
    students = [make_student(f"estudiante{i}@unal.edu.co") for i in range(6)]
    hold_the_lock(monkeypatch)

    statuses = race([post_reservation(student, slot) for student in students])

    assert statuses.count(201) == 3
    assert statuses.count(409) == 3
    assert confirmed(slot) == 3


def test_t_04_23_same_student_twice_at_once_on_a_group_slot_books_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    slot = make_slot(*make_assigned_monitor(), capacity=3)
    ana = make_student("ana@unal.edu.co")
    hold_the_lock(monkeypatch)

    statuses = race([post_reservation(ana, slot), post_reservation(ana, slot)])

    assert sorted(statuses) == [201, 409]
    assert confirmed(slot) == 1
