"""Availability use cases: publish, edit and withdraw slots, and weekly templates (FASE-03).

Pure rules live in `domain/rules.py`; this module adds what needs the database: the monitor's
assignment (RN-003.5), the term that contains a slot and the monitor's other slots (RN-003.3).
The no-overlap exclusion constraint backs the overlap check under concurrent requests.
"""

from collections.abc import Callable
from datetime import date, datetime, time, timedelta
from typing import Any, TypeVar

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import QuerySet
from django.utils import timezone

from apps.academics.domain.rules import InactiveSubjectError, ensure_accepts_new_slots
from apps.academics.models import AcademicTerm, Subject
from apps.academics.services import NOT_ASSIGNED_MESSAGE, is_monitor_assigned
from apps.accounts.models import User
from apps.availability.domain.rules import (
    LOCAL_TZ,
    SlotRuleError,
    SlotStatus,
    ensure_start_step,
    ensure_valid_window,
    overlaps,
)
from apps.availability.models import AvailabilitySlot, SlotTemplate

OVERLAP_MESSAGE = "Se solapa con otra franja tuya."
OUT_OF_TERM_MESSAGE = "La franja no cae dentro de ningún período académico."
RESERVED_MESSAGE = "La franja tiene una reserva y no se puede modificar ni retirar."
NOT_AVAILABLE_MESSAGE = "La franja ya no está disponible."
WEEKDAY_MESSAGE = "El día debe estar entre 0 (lunes) y 6 (domingo)."
NO_WEEKS_MESSAGE = "El período no tiene semanas restantes para esta plantilla."

EDITABLE_FIELDS = frozenset({"starts_at", "modality", "location", "capacity"})

T = TypeVar("T")


class SlotForbiddenError(Exception):
    """The monitor may not publish on this subject: no role or no assignment (RN-003.5)."""

    def __init__(self, message: str = NOT_ASSIGNED_MESSAGE) -> None:
        super().__init__(message)
        self.message = message


class SlotConflictError(Exception):
    """The slot's state forbids the change, e.g. it holds a reservation (RN-003.4)."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class TemplateConflictError(SlotRuleError):
    """Some weeks of a template collide with the monitor's slots; nothing was created."""

    def __init__(self, dates: list[date]) -> None:
        listed = ", ".join(day.isoformat() for day in dates)
        super().__init__(
            "start_time", f"Estas semanas se solapan con otras franjas tuyas: {listed}."
        )
        self.dates = dates


def _duration() -> timedelta:
    return timedelta(minutes=settings.SLOT_DURATION_MINUTES)


def _ensure_window(starts_at: datetime) -> None:
    ensure_valid_window(
        starts_at,
        starts_at + _duration(),
        now=timezone.now(),
        duration_minutes=settings.SLOT_DURATION_MINUTES,
        start_step_minutes=settings.SLOT_START_STEP_MINUTES,
    )


def _ensure_publishable(monitor: User, subject: Subject, term: AcademicTerm) -> None:
    """Authorization first (403), then the subject's own state (400)."""
    if not is_monitor_assigned(monitor, subject, term):
        raise SlotForbiddenError
    try:
        ensure_accepts_new_slots(subject)
    except InactiveSubjectError as error:
        raise SlotRuleError("subject", str(error)) from error


def _term_containing(starts_at: datetime) -> AcademicTerm:
    day = starts_at.astimezone(LOCAL_TZ).date()
    term = AcademicTerm.objects.filter(start_date__lte=day, end_date__gte=day).first()
    if term is None:
        raise SlotRuleError("starts_at", OUT_OF_TERM_MESSAGE)
    return term


def _blocking_slots(monitor: User) -> QuerySet[AvailabilitySlot]:
    """Slots that hold their time: every state except CANCELLED (RN-003.3)."""
    return AvailabilitySlot.objects.filter(monitor=monitor).exclude(
        status=SlotStatus.CANCELLED.value
    )


def _ensure_free(monitor: User, starts_at: datetime, *, ignore: int | None = None) -> None:
    clashes = _blocking_slots(monitor).filter(
        starts_at__lt=starts_at + _duration(), ends_at__gt=starts_at
    )
    if ignore is not None:
        clashes = clashes.exclude(pk=ignore)
    if clashes.exists():
        raise SlotRuleError("starts_at", OVERLAP_MESSAGE)


def _save_or_overlap(save: Callable[[], T]) -> T:
    """A concurrent request may take the time between the check and the write."""
    try:
        with transaction.atomic():
            return save()
    except IntegrityError as error:
        raise SlotRuleError("starts_at", OVERLAP_MESSAGE) from error


def create_slot(
    *,
    monitor: User,
    subject: Subject,
    starts_at: datetime,
    modality: str,
    location: str,
    capacity: int | None = None,
) -> AvailabilitySlot:
    """Publishes a single dated slot (T-03.5, T-03.6, CA-HU05-1, CA-HU05-2, CA-HU05-5)."""
    _ensure_window(starts_at)
    term = _term_containing(starts_at)
    _ensure_publishable(monitor, subject, term)
    _ensure_free(monitor, starts_at)
    return _save_or_overlap(
        lambda: AvailabilitySlot.objects.create(
            monitor=monitor,
            subject=subject,
            term=term,
            starts_at=starts_at,
            ends_at=starts_at + _duration(),
            capacity=settings.SLOT_DEFAULT_CAPACITY if capacity is None else capacity,
            modality=modality,
            location=location,
        )
    )


def _lock_available(slot: AvailabilitySlot) -> AvailabilitySlot:
    """Locks the row so a reservation (FASE-04) cannot slip in during the change."""
    locked = AvailabilitySlot.objects.select_for_update().get(pk=slot.pk)
    if locked.status == SlotStatus.RESERVED:
        raise SlotConflictError(RESERVED_MESSAGE)
    if locked.status != SlotStatus.AVAILABLE:
        raise SlotConflictError(NOT_AVAILABLE_MESSAGE)
    return locked


@transaction.atomic
def update_slot(slot: AvailabilitySlot, data: dict[str, Any]) -> AvailabilitySlot:
    """Moves or edits an available slot; a reserved one keeps its schedule (RN-003.4)."""
    unknown = set(data) - EDITABLE_FIELDS
    if unknown:
        raise ValueError(f"Campos no editables: {sorted(unknown)}")
    locked = _lock_available(slot)
    changes = dict(data)
    if "starts_at" in changes:
        starts_at = changes["starts_at"]
        _ensure_window(starts_at)
        term = _term_containing(starts_at)
        _ensure_publishable(locked.monitor, locked.subject, term)
        _ensure_free(locked.monitor, starts_at, ignore=locked.pk)
        changes.update(ends_at=starts_at + _duration(), term=term)
    for field, value in changes.items():
        setattr(slot, field, value)
    if changes:
        _save_or_overlap(lambda: slot.save(update_fields=list(changes)))
    return slot


@transaction.atomic
def cancel_slot(slot: AvailabilitySlot) -> AvailabilitySlot:
    """Withdraws a slot: it becomes CANCELLED and the row is kept (T-03.7, CA-HU05-3/4)."""
    locked = _lock_available(slot)
    locked.transition_to(SlotStatus.CANCELLED)
    slot.status = locked.status
    return slot


def _template_starts(term: AcademicTerm, weekday: int, start_time: time) -> list[datetime]:
    """Every remaining `weekday` of the term at `start_time` in Bogotá, still in the future."""
    now = timezone.now()
    day = max(term.start_date, timezone.localdate(timezone=LOCAL_TZ))
    day += timedelta(days=(weekday - day.weekday()) % 7)
    starts = []
    while day <= term.end_date:
        starts_at = datetime.combine(day, start_time, tzinfo=LOCAL_TZ)
        if starts_at > now:
            starts.append(starts_at)
        day += timedelta(weeks=1)
    return starts


def _conflicting_days(monitor: User, starts: list[datetime]) -> list[date]:
    length = _duration()
    taken = list(
        _blocking_slots(monitor)
        .filter(starts_at__lt=starts[-1] + length, ends_at__gt=starts[0])
        .values_list("starts_at", "ends_at")
    )
    return [
        start.date()
        for start in starts
        if any(overlaps(start, start + length, begin, end) for begin, end in taken)
    ]


def create_template(
    *,
    monitor: User,
    subject: Subject,
    term: AcademicTerm,
    weekday: int,
    start_time: time,
    modality: str,
    location: str,
    capacity: int | None = None,
) -> SlotTemplate:
    """Creates a weekly template and its dated slots, all or nothing (ADR-010, condition c)."""
    _ensure_publishable(monitor, subject, term)
    if not 0 <= weekday <= 6:
        raise SlotRuleError("weekday", WEEKDAY_MESSAGE)
    ensure_start_step(start_time, settings.SLOT_START_STEP_MINUTES, "start_time")
    starts = _template_starts(term, weekday, start_time)
    if not starts:
        raise SlotRuleError("weekday", NO_WEEKS_MESSAGE)
    conflicts = _conflicting_days(monitor, starts)
    if conflicts:
        raise TemplateConflictError(conflicts)
    capacity = settings.SLOT_DEFAULT_CAPACITY if capacity is None else capacity

    def save() -> SlotTemplate:
        template = SlotTemplate.objects.create(
            monitor=monitor,
            subject=subject,
            term=term,
            weekday=weekday,
            start_time=start_time,
            capacity=capacity,
            modality=modality,
            location=location,
        )
        AvailabilitySlot.objects.bulk_create(
            AvailabilitySlot(
                monitor=monitor,
                subject=subject,
                term=term,
                template=template,
                starts_at=starts_at,
                ends_at=starts_at + _duration(),
                capacity=capacity,
                modality=modality,
                location=location,
            )
            for starts_at in starts
        )
        return template

    return _save_or_overlap(save)


@transaction.atomic
def deactivate_template(template: SlotTemplate) -> SlotTemplate:
    """Stops a template and withdraws its future slots that hold no reservation."""
    template.is_active = False
    template.save(update_fields=["is_active"])
    # AVAILABLE -> CANCELLED is an allowed transition (DDD section 6.1).
    template.slots.filter(status=SlotStatus.AVAILABLE.value, starts_at__gt=timezone.now()).update(
        status=SlotStatus.CANCELLED.value
    )
    return template
