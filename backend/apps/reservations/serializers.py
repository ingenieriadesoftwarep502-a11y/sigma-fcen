"""Request and response shapes of the reservations API (FASE-04 §5)."""

from typing import Any, ClassVar

from rest_framework import serializers

from apps.academics.models import AcademicTerm
from apps.academics.serializers import SubjectReferenceSerializer
from apps.availability.domain.rules import SlotStatus
from apps.availability.models import AvailabilitySlot
from apps.availability.serializers import MonitorReferenceSerializer
from apps.reservations.domain.rules import MAX_NOTE_LENGTH, ReservationStatus
from apps.reservations.models import Reservation
from apps.reservations.selectors import AS_MONITOR, AS_STUDENT, PAST, UPCOMING

MAX_REASON_LENGTH = 500


class ReservationSlotSerializer(serializers.ModelSerializer[AvailabilitySlot]):
    """The booked slot: when, where, with whom and for which subject."""

    subject = SubjectReferenceSerializer(read_only=True)
    monitor = MonitorReferenceSerializer(read_only=True)
    term: serializers.SlugRelatedField[AcademicTerm] = serializers.SlugRelatedField(
        slug_field="code", read_only=True
    )
    status = serializers.ChoiceField(choices=[s.value for s in SlotStatus], read_only=True)

    class Meta:
        model = AvailabilitySlot
        fields: ClassVar[list[str]] = [
            "id",
            "subject",
            "monitor",
            "term",
            "starts_at",
            "ends_at",
            "capacity",
            "status",
            "modality",
            "location",
        ]
        read_only_fields = fields


class ReservationSerializer(serializers.ModelSerializer[Reservation]):
    slot = ReservationSlotSerializer(read_only=True)
    # Only the name: the monitor sees who is coming, never their email (RNF-SEC).
    student = MonitorReferenceSerializer(read_only=True)
    cancelled_by = MonitorReferenceSerializer(read_only=True, allow_null=True)
    status = serializers.ChoiceField(choices=[s.value for s in ReservationStatus], read_only=True)

    class Meta:
        model = Reservation
        fields: ClassVar[list[str]] = [
            "id",
            "slot",
            "student",
            "status",
            "student_note",
            "created_at",
            "cancelled_at",
            "cancelled_by",
            "cancellation_reason",
        ]
        read_only_fields = fields


class ReservationCreateSerializer(serializers.Serializer[dict[str, Any]]):
    """Only the slot: the student is always the authenticated user (FASE-04 §5)."""

    slot_id = serializers.PrimaryKeyRelatedField(
        queryset=AvailabilitySlot.objects.all(), help_text="Id de la franja a reservar."
    )
    note = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=MAX_NOTE_LENGTH,
        help_text="Nota opcional para el monitor; no se puede editar después (RF-047).",
    )


class ReservationCancelSerializer(serializers.Serializer[dict[str, Any]]):
    reason = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=MAX_REASON_LENGTH,
        help_text="Justificación; obligatoria si cancela el monitor o un administrador.",
    )


class MineFilterSerializer(serializers.Serializer[dict[str, Any]]):
    role = serializers.ChoiceField(
        required=False,
        choices=[AS_STUDENT, AS_MONITOR],
        help_text=(
            "student: reservas hechas por el usuario; monitor: reservas en sus franjas. "
            "Sin valor, ambas."
        ),
    )
    status = serializers.ChoiceField(required=False, choices=[s.value for s in ReservationStatus])
    when = serializers.ChoiceField(
        required=False,
        choices=[UPCOMING, PAST],
        help_text="upcoming: por empezar, la más próxima primero; past: ya iniciadas.",
    )
