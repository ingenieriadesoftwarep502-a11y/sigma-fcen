"""TutoringSession aggregate with SessionAttendance and Topic (DDD section 4.5, FASE-05 §4).

A group slot holds several reservations, so the session belongs to the slot and each
reservation gets its own attendance row (confirmed 2026-10-22).
"""

import uuid
from typing import ClassVar

from django.conf import settings
from django.db import models
from django.db.models.functions import Lower
from django.utils import timezone

from apps.academics.models import Subject
from apps.availability.models import AvailabilitySlot
from apps.materials.models import Material
from apps.reservations.models import Reservation
from apps.tutoring_sessions.domain.rules import (
    MAX_DURATION_MINUTES,
    MAX_NOTES_LENGTH,
    MAX_TOPIC_NAME_LENGTH,
    AttendanceStatus,
)

ATTENDANCE_CHOICES = [(status.value, status.value) for status in AttendanceStatus]


class Topic(models.Model):
    """An academic topic of a subject; an entity, not free text, so RF-083 can count it."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    subject = models.ForeignKey(
        Subject, on_delete=models.PROTECT, related_name="topics", db_index=False
    )
    name = models.CharField("nombre", max_length=MAX_TOPIC_NAME_LENGTH)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="+",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField("creado", auto_now_add=True)

    class Meta:
        ordering: ClassVar[list[str]] = ["name"]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            # Also the index of a subject's catalog, hence the subject first.
            models.UniqueConstraint(
                models.F("subject"),
                Lower("name"),
                name="sessions_topic_unique_name_per_subject",
            ),
        ]

    def __str__(self) -> str:
        return self.name


class TutoringSession(models.Model):
    """What happened in a slot that already started: topics, notes, material and duration."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # RN-006.3: one session per slot, guaranteed by the database.
    slot = models.OneToOneField(
        AvailabilitySlot, on_delete=models.PROTECT, related_name="tutoring_session"
    )
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="recorded_sessions"
    )
    topics = models.ManyToManyField(Topic, related_name="sessions", blank=True)
    materials = models.ManyToManyField(Material, related_name="sessions", blank=True)
    # The monitor's observations; students never read them (RN-006.9).
    notes = models.TextField("observaciones", max_length=MAX_NOTES_LENGTH, blank=True, default="")
    duration_minutes = models.PositiveSmallIntegerField("duración en minutos")
    # Opens the edit window (RN-006.6).
    recorded_at = models.DateTimeField("registrada", default=timezone.now, editable=False)
    updated_at = models.DateTimeField("actualizada", auto_now=True)

    class Meta:
        ordering: ClassVar[list[str]] = ["-recorded_at"]
        indexes: ClassVar[list[models.Index]] = [
            # Aggregates of FASE-09 by date (DDD section 8).
            models.Index(fields=["recorded_at"], name="sessions_recorded_at"),
        ]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.CheckConstraint(
                condition=models.Q(duration_minutes__gte=1)
                & models.Q(duration_minutes__lte=MAX_DURATION_MINUTES),
                name="sessions_duration_range",
            ),
        ]

    def __str__(self) -> str:
        return f"Sesión de la franja {self.slot_id}"


class SessionAttendance(models.Model):
    """Whether the student of one reservation came; it fixes the reservation's outcome."""

    session = models.ForeignKey(
        TutoringSession, on_delete=models.PROTECT, related_name="attendances"
    )
    # RN-006.3: a reservation is marked at most once.
    reservation = models.OneToOneField(
        Reservation, on_delete=models.PROTECT, related_name="attendance"
    )
    attendance = models.CharField("asistencia", max_length=10, choices=ATTENDANCE_CHOICES)

    class Meta:
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.CheckConstraint(
                condition=models.Q(attendance__in=[status.value for status in AttendanceStatus]),
                name="sessions_attendance_valid",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.reservation_id} · {self.attendance}"
