"""Reservation aggregate (DDD section 4.4): the most critical invariants of the system."""

import uuid
from datetime import datetime
from typing import ClassVar

from django.conf import settings
from django.db import models

from apps.accounts.models import User
from apps.availability.models import AvailabilitySlot
from apps.reservations.domain.rules import MAX_NOTE_LENGTH, ReservationStatus, ensure_transition

STATUS_CHOICES = [(status.value, status.value) for status in ReservationStatus]


class Reservation(models.Model):
    """A student's seat in a slot. Its state changes only through `transition_to`."""

    Status = ReservationStatus

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    slot = models.ForeignKey(
        AvailabilitySlot, on_delete=models.PROTECT, related_name="reservations", db_index=False
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="reservations",
        db_index=False,
    )
    status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default=ReservationStatus.CONFIRMED.value
    )
    # RF-047: set once at creation, never edited; only the student, the slot's monitor and
    # administrators read it.
    student_note = models.CharField(
        "nota del estudiante", max_length=MAX_NOTE_LENGTH, blank=True, default=""
    )
    created_at = models.DateTimeField("creada", auto_now_add=True)
    cancelled_at = models.DateTimeField("cancelada", null=True, blank=True)
    # Required when someone other than the student cancels (ADR-011, RN-005.5).
    cancellation_reason = models.TextField("justificación", blank=True, default="")
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="+",
        null=True,
        blank=True,
    )

    class Meta:
        ordering: ClassVar[list[str]] = ["-created_at"]
        indexes: ClassVar[list[models.Index]] = [
            # Seats taken in a slot: the count under lock and the search's remaining seats.
            models.Index(fields=["slot", "status"], name="reservations_slot_status"),
            # A student's own reservations: overlap, weekly limit and "my reservations".
            models.Index(fields=["student", "status"], name="reservations_student_status"),
        ]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            # RN-004.3, ADR-010 R3: the last line of defence against a double booking.
            models.UniqueConstraint(
                fields=["slot", "student"],
                condition=models.Q(status=ReservationStatus.CONFIRMED.value),
                name="reservations_one_confirmed_per_student_and_slot",
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=[status.value for status in ReservationStatus]),
                name="reservations_status_valid",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.student} · franja {self.slot_id} · {self.status}"

    def transition_to(
        self,
        target: ReservationStatus,
        *,
        by: User | None = None,
        at: datetime | None = None,
        reason: str = "",
    ) -> None:
        """Changes the state only through an allowed transition (DDD section 6.2).

        A cancellation (`at` given) also records who ended the reservation, when and why.
        """
        ensure_transition(ReservationStatus(self.status), target)
        self.status = target.value
        fields = ["status"]
        if target in (ReservationStatus.CANCELLED, ReservationStatus.NO_SHOW) and at is not None:
            self.cancelled_at = at
            self.cancelled_by = by
            self.cancellation_reason = reason
            fields += ["cancelled_at", "cancelled_by", "cancellation_reason"]
        self.save(update_fields=fields)
