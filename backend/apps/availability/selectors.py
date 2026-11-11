"""Read-side queries of the availability context: a monitor's slots and the student search.

Every listing joins what its serializer prints, so a page costs a fixed number of queries
(T-03.14, RNF-PER-001).
"""

from datetime import date, datetime, time, timedelta
from uuid import UUID

from django.db.models import Count, F, Q, QuerySet
from django.utils import timezone

from apps.academics.models import AcademicTerm
from apps.accounts.models import User
from apps.availability.domain.rules import LOCAL_TZ, SlotStatus
from apps.availability.models import AvailabilitySlot, SlotTemplate
from apps.reservations.domain.rules import ReservationStatus

CONFIRMED = ReservationStatus.CONFIRMED.value


def _local_midnight(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=LOCAL_TZ)


def _between(
    slots: QuerySet[AvailabilitySlot], date_from: date | None, date_to: date | None
) -> QuerySet[AvailabilitySlot]:
    """Inclusive range of local Bogotá dates on the slot's start."""
    if date_from is not None:
        slots = slots.filter(starts_at__gte=_local_midnight(date_from))
    if date_to is not None:
        slots = slots.filter(starts_at__lt=_local_midnight(date_to + timedelta(days=1)))
    return slots


def slots_with_details() -> QuerySet[AvailabilitySlot]:
    """Slots with what their serializer prints, `remaining_seats` included (ADR-010 R4).

    The seats come from one aggregate in the same query, so a page never costs a query per
    slot (T-04.24, RNF-PER-001).
    """
    return (
        AvailabilitySlot.objects.select_related("subject", "monitor", "term")
        .annotate(
            remaining_seats=F("capacity")
            - Count("reservations", filter=Q(reservations__status=CONFIRMED))
        )
        .order_by("starts_at", "id")
    )


def monitor_slots(
    monitor: User,
    *,
    term: AcademicTerm | None,
    subject: int | None = None,
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> QuerySet[AvailabilitySlot]:
    """The monitor's own slots in `term`, every state included."""
    slots = slots_with_details().filter(monitor=monitor)
    if term is not None:
        slots = slots.filter(term=term)
    if subject is not None:
        slots = slots.filter(subject_id=subject)
    if status is not None:
        slots = slots.filter(status=status)
    return _between(slots, date_from, date_to)


def search_slots(
    *,
    term: AcademicTerm | None = None,
    subject: int | None = None,
    monitor: UUID | None = None,
    modality: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> QuerySet[AvailabilitySlot]:
    """Bookable slots: AVAILABLE, in the future and offered by an active account (CA-HU02-1).

    Served by the (subject, starts_at, status) index when filtered by subject (T-03.14).
    """
    slots = slots_with_details().filter(
        status=SlotStatus.AVAILABLE.value,
        starts_at__gt=timezone.now(),
        monitor__is_active=True,
    )
    if term is not None:
        slots = slots.filter(term=term)
    if subject is not None:
        slots = slots.filter(subject_id=subject)
    if monitor is not None:
        slots = slots.filter(monitor_id=monitor)
    if modality is not None:
        slots = slots.filter(modality=modality)
    return _between(slots, date_from, date_to)


def templates_with_details() -> QuerySet[SlotTemplate]:
    # Aggregation drops Meta.ordering; pagination needs a stable order.
    return (
        SlotTemplate.objects.select_related("subject", "term")
        .annotate(slots_created=Count("slots"))
        .order_by("weekday", "start_time", "id")
    )


def monitor_templates(
    monitor: User, term: AcademicTerm | None, subject: int | None = None
) -> QuerySet[SlotTemplate]:
    templates = templates_with_details().filter(monitor=monitor)
    if term is not None:
        templates = templates.filter(term=term)
    if subject is not None:
        templates = templates.filter(subject_id=subject)
    return templates
