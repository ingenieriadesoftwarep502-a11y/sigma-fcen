"""The student search is served by the (subject, starts_at, status) index (T-03.14, RNF-PER-002).

FASE-03 DoD: index verified with EXPLAIN on the search query, with a realistic volume.
"""

import pytest
from django.db import connection

from apps.availability.models import AvailabilitySlot
from apps.availability.selectors import search_slots
from tests.availability_data import HOUR, SLOT_START, make_assigned_monitor
from tests.catalog_data import make_subject

pytestmark = pytest.mark.django_db

SLOTS = 1000
SUBJECTS = 10
JOINED_TABLES = (
    "availability_availabilityslot",
    "accounts_user",
    "academics_subject",
    "academics_academicterm",
)


@pytest.fixture
def thousand_slots() -> list[int]:
    subject_ids = []
    rows = []
    for n in range(SUBJECTS):
        subject = make_subject(f"S-{n}", f"Asignatura {n}")
        monitor, _, term = make_assigned_monitor(f"monitor{n}@unal.edu.co", subject)
        subject_ids.append(subject.pk)
        rows += [
            AvailabilitySlot(
                monitor=monitor,
                subject=subject,
                term=term,
                starts_at=SLOT_START + i * HOUR,
                ends_at=SLOT_START + (i + 1) * HOUR,
                location="Aula",
            )
            for i in range(SLOTS // SUBJECTS)
        ]
    AvailabilitySlot.objects.bulk_create(rows)
    # Fresh statistics for every joined table: stale ones from earlier tests in the same
    # database can make the planner enter through accounts_user instead.
    with connection.cursor() as cursor:
        for table in JOINED_TABLES:
            cursor.execute(f"ANALYZE {table}")
    return subject_ids


def test_t_03_14_search_by_subject_uses_the_search_index(thousand_slots: list[int]) -> None:
    query = search_slots(subject=thousand_slots[0])
    with connection.cursor() as cursor:
        # Rule out the sequential scan to check the index can serve the query at all.
        cursor.execute("SET LOCAL enable_seqscan = off")
        plan = query.explain()

    assert "availability_slot_search" in plan, plan
    assert query.count() == SLOTS // SUBJECTS
