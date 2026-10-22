"""Session use cases: record what happened in a slot, correct it, and grow the topic catalog.

Recording follows the lock order of the reservations context: the acting user's row, then the
slot, then its CONFIRMED reservations. Once a slot starts nobody can cancel its reservations
(ADR-011), so the set to mark is stable; the locks keep two submissions of the same session
apart. The session and every reservation outcome are written in one transaction (RN-006.5).

The domain event `SessionRecorded` (DDD §7) is a documented extension point: inviting the
students to evaluate arrives with FASE-06.
"""

from collections.abc import Iterable, Sequence
from datetime import timedelta
from typing import Any
from uuid import UUID

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.academics.models import Subject
from apps.academics.selectors import current_term
from apps.academics.services import is_monitor_assigned
from apps.accounts.models import Role, User
from apps.availability.models import AvailabilitySlot
from apps.materials.models import Material
from apps.reservations.domain.rules import ReservationStatus
from apps.reservations.models import Reservation
from apps.tutoring_sessions.domain.rules import (
    AttendanceStatus,
    SessionConflictError,
    SessionForbiddenError,
    SessionRuleError,
    clean_notes,
    clean_topic_name,
    ensure_attendance_complete,
    ensure_duration,
    ensure_editable,
    ensure_has_reservations,
    ensure_started,
    ensure_topics_when_attended,
    reservation_outcome,
)
from apps.tutoring_sessions.models import SessionAttendance, Topic, TutoringSession

SESSION_UNIQUE = "tutoring_sessions_tutoringsession_slot_id_key"
TOPIC_UNIQUE = "sessions_topic_unique_name_per_subject"

NOT_SLOT_MONITOR_MESSAGE = "Solo el monitor de la franja registra o edita su sesión."
ALREADY_RECORDED_MESSAGE = "La sesión de esta franja ya fue registrada."
FOREIGN_TOPIC_MESSAGE = "Uno de los temas no pertenece a la asignatura de la franja."
FOREIGN_MATERIAL_MESSAGE = "Uno de los materiales no está disponible en la asignatura de la franja."
TOPIC_AUTHOR_MESSAGE = (
    "Solo el monitor asignado a la asignatura o un administrador pueden crear temas."
)

MINUTE = timedelta(minutes=1)
CONFIRMED = ReservationStatus.CONFIRMED.value

Marks = Sequence[tuple[UUID, AttendanceStatus]]


def _lock_user(user: User) -> None:
    """The first lock of every write: the acting user's row (see the module docstring)."""
    list(User.objects.select_for_update().filter(pk=user.pk).values_list("pk", flat=True))


def _ensure_slot_monitor(slot: AvailabilitySlot, user: User) -> None:
    """RN-006.4, CA-HU06-5."""
    if slot.monitor_id != user.pk:
        raise SessionForbiddenError(NOT_SLOT_MONITOR_MESSAGE)


def _already_recorded(slot: AvailabilitySlot) -> bool:
    return TutoringSession.objects.filter(slot=slot).exists()


def _topics_of(subject_id: int, ids: Iterable[UUID]) -> list[Topic]:
    wanted = set(ids)
    topics = list(Topic.objects.filter(subject_id=subject_id, pk__in=wanted))
    if len(topics) != len(wanted):
        raise SessionRuleError("topic_ids", FOREIGN_TOPIC_MESSAGE)
    return topics


def _materials_of(subject_id: int, ids: Iterable[UUID]) -> list[Material]:
    """Only active material of the slot's subject (FASE-07 hides removed material)."""
    wanted = set(ids)
    materials = list(Material.objects.filter(subject_id=subject_id, is_active=True, pk__in=wanted))
    if len(materials) != len(wanted):
        raise SessionRuleError("material_ids", FOREIGN_MATERIAL_MESSAGE)
    return materials


def _insert(**fields: Any) -> TutoringSession:
    """The one-to-one on the slot is the last line of defence; its violation is a conflict."""
    try:
        with transaction.atomic():
            return TutoringSession.objects.create(**fields)
    except IntegrityError as error:
        diag = getattr(error.__cause__, "diag", None)
        if getattr(diag, "constraint_name", None) != SESSION_UNIQUE:
            raise
        raise SessionConflictError("already_recorded", ALREADY_RECORDED_MESSAGE) from error


@transaction.atomic
def record_session(
    *,
    monitor: User,
    slot: AvailabilitySlot,
    attendance: Marks,
    topic_ids: Iterable[UUID],
    material_ids: Iterable[UUID],
    notes: str | None,
    duration_minutes: int | None,
) -> TutoringSession:
    """Records the session of a started slot and closes its reservations (T-05.5, HU-06).

    Every CONFIRMED reservation is marked once: ATTENDED completes it, NO_SHOW records the
    absence (RN-006.5). The monitor is always the authenticated user.
    """
    _lock_user(monitor)
    locked = AvailabilitySlot.objects.select_for_update().get(pk=slot.pk)
    _ensure_slot_monitor(locked, monitor)
    if _already_recorded(locked):
        raise SessionConflictError("already_recorded", ALREADY_RECORDED_MESSAGE)
    ensure_started(locked.starts_at, now=timezone.now())

    reservations = {
        reservation.pk: reservation
        for reservation in Reservation.objects.select_for_update().filter(
            slot=locked, status=CONFIRMED
        )
    }
    ensure_has_reservations(set(reservations))
    ensure_attendance_complete(set(reservations), [pk for pk, _ in attendance])

    topics = _topics_of(locked.subject_id, topic_ids)
    materials = _materials_of(locked.subject_id, material_ids)
    ensure_topics_when_attended([mark for _, mark in attendance], topic_count=len(topics))
    minutes = (
        duration_minutes
        if duration_minutes is not None
        else (locked.ends_at - locked.starts_at) // MINUTE
    )
    ensure_duration(minutes)

    session = _insert(
        slot=locked,
        recorded_by=monitor,
        notes=clean_notes(notes),
        duration_minutes=minutes,
    )
    session.topics.set(topics)
    session.materials.set(materials)
    for pk, mark in attendance:
        reservation = reservations[pk]
        SessionAttendance.objects.create(
            session=session, reservation=reservation, attendance=mark.value
        )
        reservation.close_by_session(reservation_outcome(mark))
    return session


@transaction.atomic
def update_session(
    *, session: TutoringSession, actor: User, changes: dict[str, Any]
) -> TutoringSession:
    """Corrects topics, notes, material and duration for 48 hours (T-05.10, RN-006.6, RF-052).

    Attendance is final once recorded (RN-006.8): the record is the source of truth for the
    reservation's state (DDD §6.2).
    """
    locked = (
        TutoringSession.objects.select_for_update(of=("self",))
        .select_related("slot")
        .get(pk=session.pk)
    )
    _ensure_slot_monitor(locked.slot, actor)
    ensure_editable(
        locked.recorded_at, now=timezone.now(), window_hours=settings.SESSION_EDIT_WINDOW_HOURS
    )

    subject_id = locked.slot.subject_id
    if "topic_ids" in changes:
        topics = _topics_of(subject_id, changes["topic_ids"])
        attendances = [
            AttendanceStatus(value)
            for value in locked.attendances.values_list("attendance", flat=True)
        ]
        ensure_topics_when_attended(attendances, topic_count=len(topics))
        locked.topics.set(topics)
    if "material_ids" in changes:
        locked.materials.set(_materials_of(subject_id, changes["material_ids"]))
    if "notes" in changes:
        locked.notes = clean_notes(changes["notes"])
    if "duration_minutes" in changes:
        ensure_duration(changes["duration_minutes"])
        locked.duration_minutes = changes["duration_minutes"]
    locked.save(update_fields=["notes", "duration_minutes", "updated_at"])
    return locked


def _may_create_topics(actor: User, subject: Subject) -> bool:
    if actor.has_role(Role.Code.ADMIN):
        return True
    term = current_term()
    return term is not None and is_monitor_assigned(actor, subject, term)


def _existing_topic(subject: Subject, name: str) -> Topic | None:
    return Topic.objects.filter(subject=subject, name__iexact=name).first()


def create_topic(*, actor: User, subject: Subject, name: str | None) -> tuple[Topic, bool]:
    """Adds a topic to a subject's catalog, or returns the one with that name (T-05.21).

    Idempotent: names compare ignoring case and repeated spaces, so the catalog never holds
    two spellings of one topic. The second item tells whether it was created.
    """
    if not _may_create_topics(actor, subject):
        raise SessionForbiddenError(TOPIC_AUTHOR_MESSAGE)
    cleaned = clean_topic_name(name)
    existing = _existing_topic(subject, cleaned)
    if existing is not None:
        return existing, False
    try:
        with transaction.atomic():
            return Topic.objects.create(subject=subject, name=cleaned, created_by=actor), True
    except IntegrityError as error:
        diag = getattr(error.__cause__, "diag", None)
        if getattr(diag, "constraint_name", None) != TOPIC_UNIQUE:
            raise
        # Another request created it between the lookup and the insert.
        return Topic.objects.get(subject=subject, name__iexact=cleaned), False
