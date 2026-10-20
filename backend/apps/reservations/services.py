"""Reservation use cases: reserve a seat and cancel it, each in one transaction (FASE-04 §6).

Three layers keep a slot from being overbooked; none replaces the others:

1. Database: a partial unique index on (slot, student) for CONFIRMED reservations.
2. Service: the slot row is locked with SELECT ... FOR UPDATE inside `transaction.atomic()`,
   and its CONFIRMED reservations are counted against the capacity under that lock.
3. API: domain conflicts, including a unique violation, become a 409 response.

Lock order is always student, then slot, then reservation, so concurrent reservations,
cancellations and slot edits cannot deadlock each other. No external call runs inside a
transaction (FASE-04 §11).

Domain events `ReservationConfirmed` and `ReservationCancelled` (DDD §7) are documented
extension points: notifications are not implemented in v1 (ADR-011, item 3).
"""

from datetime import datetime

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.accounts.models import Role, User
from apps.availability.domain.rules import SlotStatus
from apps.availability.models import AvailabilitySlot
from apps.reservations.domain.rules import (
    SLOT_FIELD,
    ReservationConflictError,
    ReservationForbiddenError,
    ReservationRuleError,
    ReservationStatus,
    clean_note,
    ensure_below_active_limit,
    ensure_bookable,
    ensure_has_seat,
    ensure_no_own_overlap,
    ensure_reason,
    student_cancellation_status,
    week_bounds,
)
from apps.reservations.models import Reservation

UNIQUE_CONSTRAINT = "reservations_one_confirmed_per_student_and_slot"

STUDENTS_ONLY_MESSAGE = "Solo los estudiantes pueden reservar monitorías."
OWN_SLOT_MESSAGE = "No puedes reservar tu propia franja."
SLOT_UNAVAILABLE_MESSAGE = "La franja ya no está disponible."
ALREADY_RESERVED_MESSAGE = "Ya tienes una reserva en esta franja."
NOT_PARTICIPANT_MESSAGE = "No puedes cancelar una reserva de otra persona."
ALREADY_CANCELLED_MESSAGE = "La reserva ya fue cancelada."
NOT_ACTIVE_MESSAGE = "La reserva ya no está activa."

CONFIRMED = ReservationStatus.CONFIRMED.value


def _lock_slot(pk: int) -> AvailabilitySlot:
    """Serializes every write on the slot; no join, so only the slot row is locked."""
    return AvailabilitySlot.objects.select_for_update().get(pk=pk)


def _confirmed_count(slot: AvailabilitySlot) -> int:
    return Reservation.objects.filter(slot=slot, status=CONFIRMED).count()


def _already_reserved(student: User, slot: AvailabilitySlot) -> bool:
    return Reservation.objects.filter(slot=slot, student=student, status=CONFIRMED).exists()


def _own_confirmed_between(
    student: User, starts_at: datetime, ends_at: datetime
) -> list[tuple[datetime, datetime]]:
    return list(
        Reservation.objects.filter(
            student=student,
            status=CONFIRMED,
            slot__starts_at__lt=ends_at,
            slot__ends_at__gt=starts_at,
        ).values_list("slot__starts_at", "slot__ends_at")
    )


def _active_in_week(student: User, slot: AvailabilitySlot) -> int:
    week_start, week_end = week_bounds(slot.starts_at)
    return Reservation.objects.filter(
        student=student,
        status=CONFIRMED,
        slot__subject_id=slot.subject_id,
        slot__starts_at__gte=week_start,
        slot__starts_at__lt=week_end,
    ).count()


def _ensure_slot_open(slot: AvailabilitySlot) -> None:
    if slot.status != SlotStatus.AVAILABLE or not slot.monitor.is_active:
        raise ReservationConflictError("slot_unavailable", SLOT_UNAVAILABLE_MESSAGE)


def _insert(slot: AvailabilitySlot, student: User, note: str) -> Reservation:
    """The unique index is the last line of defence; its violation is a conflict, not a 500."""
    try:
        with transaction.atomic():
            return Reservation.objects.create(slot=slot, student=student, student_note=note)
    except IntegrityError as error:
        diag = getattr(error.__cause__, "diag", None)
        if getattr(diag, "constraint_name", None) != UNIQUE_CONSTRAINT:
            raise
        raise ReservationConflictError("already_reserved", ALREADY_RESERVED_MESSAGE) from error


@transaction.atomic
def reserve_slot(*, student: User, slot: AvailabilitySlot, note: str | None = None) -> Reservation:
    """Books a seat for the authenticated student (T-04.4, CA-HU03-1 to CA-HU03-6).

    `note` is the optional message for the monitor (RF-047); it never changes afterwards.

    The slot becomes RESERVED in the same transaction that takes its last seat (RN-004.5).
    """
    if not student.has_role(Role.Code.STUDENT):
        raise ReservationForbiddenError(STUDENTS_ONLY_MESSAGE)
    cleaned_note = clean_note(note)
    # The student's own rows go first: two of their requests on different slots must not
    # both pass the overlap and weekly-limit checks (RN-004.4, RN-004.7).
    list(User.objects.select_for_update().filter(pk=student.pk).values_list("pk", flat=True))
    locked = _lock_slot(slot.pk)

    if locked.monitor_id == student.pk:
        raise ReservationRuleError(SLOT_FIELD, OWN_SLOT_MESSAGE)
    ensure_bookable(
        locked.starts_at,
        now=timezone.now(),
        min_advance_hours=settings.RESERVATION_MIN_ADVANCE_HOURS,
    )
    _ensure_slot_open(locked)
    if _already_reserved(student, locked):
        raise ReservationConflictError("already_reserved", ALREADY_RESERVED_MESSAGE)
    confirmed = _confirmed_count(locked)
    ensure_has_seat(confirmed=confirmed, capacity=locked.capacity)
    ensure_no_own_overlap(
        locked.starts_at,
        locked.ends_at,
        _own_confirmed_between(student, locked.starts_at, locked.ends_at),
    )
    ensure_below_active_limit(
        active=_active_in_week(student, locked),
        limit=settings.RESERVATION_MAX_ACTIVE_PER_SUBJECT_WEEK,
    )

    reservation = _insert(locked, student, cleaned_note)
    if confirmed + 1 >= locked.capacity:
        locked.transition_to(SlotStatus.RESERVED)
    slot.status = locked.status
    return reservation


def _canceller(reservation: Reservation, slot: AvailabilitySlot, actor: User) -> Role.Code:
    """RN-005.4: the owner student, the slot's monitor or an administrator."""
    if reservation.student_id == actor.pk:
        return Role.Code.STUDENT
    if slot.monitor_id == actor.pk:
        return Role.Code.MONITOR
    if actor.has_role(Role.Code.ADMIN):
        return Role.Code.ADMIN
    raise ReservationForbiddenError(NOT_PARTICIPANT_MESSAGE)


@transaction.atomic
def cancel_reservation(
    *, reservation: Reservation, actor: User, reason: str | None = None
) -> Reservation:
    """Ends a CONFIRMED reservation and frees its seat, atomically (T-04.12 to T-04.16).

    ADR-011: the student cancels freely up to 4 hours before the start; later it is recorded
    as a no-show. The monitor or an administrator cancel with a mandatory reason.
    """
    slot = _lock_slot(reservation.slot_id)
    locked = Reservation.objects.select_for_update().get(pk=reservation.pk)
    role = _canceller(locked, slot, actor)
    if locked.status != CONFIRMED:
        message = (
            ALREADY_CANCELLED_MESSAGE
            if locked.status == ReservationStatus.CANCELLED
            else NOT_ACTIVE_MESSAGE
        )
        raise ReservationConflictError("already_cancelled", message)

    now = timezone.now()
    # The window decides the outcome for the student; the start closes it for everyone.
    outcome = student_cancellation_status(
        slot.starts_at, now=now, window_hours=settings.RESERVATION_CANCEL_WINDOW_HOURS
    )
    if role == Role.Code.STUDENT:
        cleaned = (reason or "").strip()
    else:
        cleaned = ensure_reason(reason)
        outcome = ReservationStatus.CANCELLED

    locked.transition_to(outcome, by=actor, at=now, reason=cleaned)
    if slot.status == SlotStatus.RESERVED:
        slot.transition_to(SlotStatus.AVAILABLE)
    return locked
