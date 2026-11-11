"""AvailabilitySlot aggregate with SlotTemplate (DDD section 4.3, ADR-010)."""

from typing import ClassVar

from django.conf import settings
from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import DateTimeRangeField, RangeOperators
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.academics.models import AcademicTerm, Subject
from apps.availability.domain.rules import SlotStatus, ensure_transition

STATUS_CHOICES = [(status.value, status.value) for status in SlotStatus]


class TsTzRange(models.Func):
    """The [starts_at, ends_at) interval, half-open like the overlap rule (RN-003.3)."""

    function = "TSTZRANGE"
    output_field = DateTimeRangeField()


class Modality(models.TextChoices):
    IN_PERSON = "IN_PERSON", "Presencial"
    VIRTUAL = "VIRTUAL", "Virtual"


def _capacity_field() -> "models.PositiveSmallIntegerField[int, int]":
    return models.PositiveSmallIntegerField(
        "capacidad",
        default=settings.SLOT_DEFAULT_CAPACITY,
        validators=[MinValueValidator(1)],
    )


class SlotTemplate(models.Model):
    """A weekly pattern that generates dated slots until the end of its term (ADR-010, c)."""

    monitor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="slot_templates"
    )
    subject = models.ForeignKey(Subject, on_delete=models.PROTECT, related_name="slot_templates")
    term = models.ForeignKey(AcademicTerm, on_delete=models.PROTECT, related_name="slot_templates")
    weekday = models.PositiveSmallIntegerField(
        "día de la semana", validators=[MaxValueValidator(6)]
    )
    # Local Bogotá time; each generated slot converts it to UTC (RNF-DAT-001).
    start_time = models.TimeField("hora de inicio")
    capacity = _capacity_field()
    modality = models.CharField(max_length=10, choices=Modality.choices, default=Modality.IN_PERSON)
    location = models.CharField("lugar o enlace", max_length=200)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering: ClassVar[list[str]] = ["weekday", "start_time"]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.CheckConstraint(
                condition=models.Q(weekday__lte=6), name="availability_template_weekday_range"
            ),
            models.CheckConstraint(
                condition=models.Q(capacity__gte=1),
                name="availability_template_capacity_positive",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.monitor} · {self.subject.code} · día {self.weekday} {self.start_time}"


class AvailabilitySlot(models.Model):
    """A dated block in which a monitor attends a subject; what students search and reserve."""

    Modality = Modality

    monitor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="availability_slots",
        db_index=False,
    )
    subject = models.ForeignKey(
        Subject, on_delete=models.PROTECT, related_name="availability_slots", db_index=False
    )
    term = models.ForeignKey(
        AcademicTerm, on_delete=models.PROTECT, related_name="availability_slots"
    )
    template = models.ForeignKey(
        SlotTemplate,
        on_delete=models.PROTECT,
        related_name="slots",
        null=True,
        blank=True,
    )
    starts_at = models.DateTimeField("inicio")
    ends_at = models.DateTimeField("fin")
    capacity = _capacity_field()
    status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default=SlotStatus.AVAILABLE.value
    )
    modality = models.CharField(max_length=10, choices=Modality.choices, default=Modality.IN_PERSON)
    location = models.CharField("lugar o enlace", max_length=200)

    class Meta:
        ordering: ClassVar[list[str]] = ["starts_at"]
        indexes: ClassVar[list[models.Index]] = [
            # Student search by subject and date (T-03.14, RNF-PER-002).
            models.Index(
                fields=["subject", "starts_at", "status"], name="availability_slot_search"
            ),
            # A monitor's own slots in date order.
            models.Index(fields=["monitor", "starts_at"], name="availability_slot_monitor"),
        ]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.CheckConstraint(
                condition=models.Q(ends_at__gt=models.F("starts_at")),
                name="availability_slot_ends_after_start",
            ),
            models.CheckConstraint(
                condition=models.Q(capacity__gte=1),
                name="availability_slot_capacity_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=[status.value for status in SlotStatus]),
                name="availability_slot_status_valid",
            ),
            # RN-003.3 holds even under concurrent requests; cancelled slots free their time.
            ExclusionConstraint(
                name="availability_slot_no_overlap",
                expressions=[
                    ("monitor", RangeOperators.EQUAL),
                    (TsTzRange("starts_at", "ends_at"), RangeOperators.OVERLAPS),
                ],
                condition=~models.Q(status=SlotStatus.CANCELLED.value),
            ),
        ]

    def __str__(self) -> str:
        return f"{self.monitor} · {self.subject.code} · {self.starts_at:%Y-%m-%d %H:%M} UTC"

    def transition_to(self, target: SlotStatus) -> None:
        """Changes the state only through an allowed transition (DDD section 6.1)."""
        ensure_transition(SlotStatus(self.status), target)
        self.status = target.value
        self.save(update_fields=["status"])
