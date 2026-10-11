"""Request and response shapes of the availability API (FASE-03 section 4.2)."""

from datetime import date
from typing import Any, ClassVar

from rest_framework import serializers

from apps.academics.models import AcademicTerm, Subject
from apps.academics.serializers import UNKNOWN_TERM_MESSAGE, SubjectReferenceSerializer
from apps.accounts.models import User
from apps.availability.domain.rules import SlotStatus
from apps.availability.models import AvailabilitySlot, Modality, SlotTemplate

DATE_RANGE_MESSAGE = "La fecha final no puede ser anterior a la inicial."
LOCATION_HELP = "Aula o enlace de la sesión."


class MonitorReferenceSerializer(serializers.Serializer[User]):
    """Only what a student needs to recognize the monitor; no email (RNF-SEC)."""

    id = serializers.UUIDField()
    full_name = serializers.SerializerMethodField()

    def get_full_name(self, user: User) -> str:
        return f"{user.first_name} {user.last_name}".strip()


class AvailabilitySlotSerializer(serializers.ModelSerializer[AvailabilitySlot]):
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
            "template",
            "starts_at",
            "ends_at",
            "capacity",
            "status",
            "modality",
            "location",
        ]
        read_only_fields = fields


class _SlotFieldsSerializer(serializers.Serializer[dict[str, Any]]):
    """Fields a monitor sets on a slot; the end and the term are derived (ADR-010)."""

    starts_at = serializers.DateTimeField(
        help_text="Inicio en ISO 8601 con zona; en punto o a la media, hora de Bogotá."
    )
    modality = serializers.ChoiceField(choices=Modality.choices)
    location = serializers.CharField(max_length=200, help_text=LOCATION_HELP)
    capacity = serializers.IntegerField(
        required=False, min_value=1, help_text="Cupos; por defecto 1."
    )


class SlotCreateSerializer(_SlotFieldsSerializer):
    subject = serializers.PrimaryKeyRelatedField(queryset=Subject.objects.all())


class SlotUpdateSerializer(_SlotFieldsSerializer):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, partial=True, **kwargs)


class _DateRangeSerializer(serializers.Serializer[dict[str, Any]]):
    date_from = serializers.DateField(required=False, help_text="Fecha local de Bogotá, incluida.")
    date_to = serializers.DateField(required=False, help_text="Fecha local de Bogotá, incluida.")

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        date_from: date | None = attrs.get("date_from")
        date_to: date | None = attrs.get("date_to")
        if date_from and date_to and date_to < date_from:
            raise serializers.ValidationError({"date_to": [DATE_RANGE_MESSAGE]})
        return attrs


def _term_field(**kwargs: Any) -> serializers.SlugRelatedField[AcademicTerm]:
    return serializers.SlugRelatedField(
        slug_field="code",
        queryset=AcademicTerm.objects.all(),
        error_messages={"does_not_exist": UNKNOWN_TERM_MESSAGE},
        **kwargs,
    )


class MineFilterSerializer(_DateRangeSerializer):
    term = _term_field(required=False, help_text="Código del período; por defecto, el actual.")
    subject = serializers.IntegerField(required=False, min_value=1, help_text="Id de asignatura.")
    status = serializers.ChoiceField(required=False, choices=[s.value for s in SlotStatus])


class SearchFilterSerializer(_DateRangeSerializer):
    subject = serializers.IntegerField(required=False, min_value=1, help_text="Id de asignatura.")
    monitor = serializers.UUIDField(required=False, help_text="Id del monitor.")
    modality = serializers.ChoiceField(required=False, choices=Modality.choices)


class TermFilterSerializer(serializers.Serializer[dict[str, Any]]):
    term = _term_field(required=False, help_text="Código del período; por defecto, el actual.")


class SlotTemplateSerializer(serializers.ModelSerializer[SlotTemplate]):
    subject = SubjectReferenceSerializer(read_only=True)
    term: serializers.SlugRelatedField[AcademicTerm] = serializers.SlugRelatedField(
        slug_field="code", read_only=True
    )
    slots_created = serializers.IntegerField(
        read_only=True, help_text="Franjas que generó la plantilla."
    )

    class Meta:
        model = SlotTemplate
        fields: ClassVar[list[str]] = [
            "id",
            "subject",
            "term",
            "weekday",
            "start_time",
            "capacity",
            "modality",
            "location",
            "is_active",
            "slots_created",
        ]
        read_only_fields = fields


class SlotTemplateCreateSerializer(serializers.Serializer[dict[str, Any]]):
    subject = serializers.PrimaryKeyRelatedField(queryset=Subject.objects.all())
    term = _term_field(help_text="Código del período, por ejemplo 2026-2.")
    weekday = serializers.IntegerField(
        min_value=0, max_value=6, help_text="Día de la semana: 0 lunes … 6 domingo."
    )
    start_time = serializers.TimeField(
        help_text="Hora local de Bogotá, en punto o a la media (por ejemplo 10:00)."
    )
    modality = serializers.ChoiceField(choices=Modality.choices)
    location = serializers.CharField(max_length=200, help_text=LOCATION_HELP)
    capacity = serializers.IntegerField(
        required=False, min_value=1, help_text="Cupos; por defecto 1."
    )
