"""Request and response shapes of the tutoring-sessions API (FASE-05 §4.3)."""

from datetime import datetime, timedelta
from typing import Any, ClassVar

from django.conf import settings
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.academics.models import Subject
from apps.accounts.models import User
from apps.availability.models import AvailabilitySlot
from apps.availability.serializers import MonitorReferenceSerializer
from apps.materials.domain.rules import MaterialKind
from apps.materials.models import Material
from apps.reservations.models import Reservation
from apps.reservations.serializers import ReservationSlotSerializer
from apps.tutoring_sessions.domain.rules import (
    MAX_DURATION_MINUTES,
    MAX_NOTES_LENGTH,
    AttendanceStatus,
)
from apps.tutoring_sessions.models import SessionAttendance, Topic, TutoringSession
from apps.tutoring_sessions.selectors import CLOSED_STATUSES

ATTENDANCE_CHOICES = [status.value for status in AttendanceStatus]
FINAL_ATTENDANCE_MESSAGE = "La asistencia no se puede editar después de registrar la sesión."
FIXED_SLOT_MESSAGE = "La franja de una sesión no se puede cambiar."

# Context key: the viewer reads everything (monitor, teacher, admin) or only their part.
FULL_VIEW = "full_view"
VIEWER = "viewer"


class TopicSerializer(serializers.ModelSerializer[Topic]):
    class Meta:
        model = Topic
        fields: ClassVar[list[str]] = ["id", "name"]
        read_only_fields = fields


class SessionMaterialSerializer(serializers.ModelSerializer[Material]):
    kind = serializers.ChoiceField(choices=[kind.value for kind in MaterialKind], read_only=True)

    class Meta:
        model = Material
        fields: ClassVar[list[str]] = ["id", "title", "kind"]
        read_only_fields = fields


class AttendanceRowSerializer(serializers.ModelSerializer[SessionAttendance]):
    reservation_id = serializers.UUIDField(read_only=True)
    # Only the name, like the reservations API (RNF-SEC).
    student = MonitorReferenceSerializer(source="reservation.student", read_only=True)
    attendance = serializers.ChoiceField(choices=ATTENDANCE_CHOICES, read_only=True)

    class Meta:
        model = SessionAttendance
        fields: ClassVar[list[str]] = ["reservation_id", "student", "attendance"]
        read_only_fields = fields


def editable_until(session: TutoringSession) -> datetime:
    return session.recorded_at + timedelta(hours=settings.SESSION_EDIT_WINDOW_HOURS)


class TutoringSessionSerializer(serializers.ModelSerializer[TutoringSession]):
    """A session; a student reading it gets no notes and only their own attendance (RN-006.9)."""

    slot = ReservationSlotSerializer(read_only=True)
    topics = TopicSerializer(many=True, read_only=True)
    materials = SessionMaterialSerializer(many=True, read_only=True)
    notes = serializers.SerializerMethodField()
    attendance = serializers.SerializerMethodField()
    editable_until = serializers.SerializerMethodField()

    class Meta:
        model = TutoringSession
        fields: ClassVar[list[str]] = [
            "id",
            "slot",
            "topics",
            "materials",
            "notes",
            "duration_minutes",
            "attendance",
            "recorded_at",
            "updated_at",
            "editable_until",
        ]
        read_only_fields = fields

    def _full(self) -> bool:
        return bool(self.context.get(FULL_VIEW, True))

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_notes(self, session: TutoringSession) -> str | None:
        return session.notes if self._full() else None

    @extend_schema_field(AttendanceRowSerializer(many=True))
    def get_attendance(self, session: TutoringSession) -> list[dict[str, Any]]:
        rows = list(session.attendances.all())
        if not self._full():
            viewer: User | None = self.context.get(VIEWER)
            rows = [row for row in rows if viewer and row.reservation.student_id == viewer.pk]
        return list(AttendanceRowSerializer(rows, many=True).data)

    def get_editable_until(self, session: TutoringSession) -> datetime:
        return editable_until(session)


class HistorySessionSerializer(serializers.ModelSerializer[TutoringSession]):
    """What a student keeps of a session in the history: no notes (RN-006.9)."""

    topics = TopicSerializer(many=True, read_only=True)

    class Meta:
        model = TutoringSession
        fields: ClassVar[list[str]] = ["id", "topics", "duration_minutes", "recorded_at"]
        read_only_fields = fields


class HistoryItemSerializer(serializers.ModelSerializer[Reservation]):
    """One closed reservation of the student (HU-12, CA-HU12-1)."""

    slot = ReservationSlotSerializer(read_only=True)
    status = serializers.ChoiceField(choices=CLOSED_STATUSES, read_only=True)
    session = serializers.SerializerMethodField()
    evaluation = serializers.SerializerMethodField()

    class Meta:
        model = Reservation
        fields: ClassVar[list[str]] = ["id", "slot", "status", "session", "evaluation"]
        read_only_fields = fields

    @extend_schema_field(HistorySessionSerializer(allow_null=True))
    def get_session(self, reservation: Reservation) -> dict[str, Any] | None:
        """A late cancellation (ADR-011) has no attendance row, hence no session."""
        try:
            session = reservation.attendance.session
        except SessionAttendance.DoesNotExist:
            return None
        return dict(HistorySessionSerializer(session).data)

    @extend_schema_field(serializers.JSONField(allow_null=True))
    def get_evaluation(self, reservation: Reservation) -> None:
        """The student's evaluation arrives with FASE-06 (ADR-013); null until then."""
        return None


class AttendanceMarkSerializer(serializers.Serializer[dict[str, Any]]):
    reservation_id = serializers.UUIDField()
    attendance = serializers.ChoiceField(choices=ATTENDANCE_CHOICES)


def _notes_field() -> serializers.CharField:
    return serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=MAX_NOTES_LENGTH,
        help_text="Observaciones del monitor; el estudiante no las ve.",
    )


def _duration_field(help_text: str) -> serializers.IntegerField:
    return serializers.IntegerField(
        required=False, min_value=1, max_value=MAX_DURATION_MINUTES, help_text=help_text
    )


def _ids_field(help_text: str, *, default: bool) -> serializers.ListField:
    if default:
        return serializers.ListField(
            child=serializers.UUIDField(), required=False, default=list, help_text=help_text
        )
    return serializers.ListField(child=serializers.UUIDField(), required=False, help_text=help_text)


class SessionCreateSerializer(serializers.Serializer[dict[str, Any]]):
    """The monitor is always the authenticated user, never a field of the body."""

    slot_id = serializers.PrimaryKeyRelatedField(
        queryset=AvailabilitySlot.objects.all(), help_text="Id de la franja ya iniciada."
    )
    attendance = AttendanceMarkSerializer(
        many=True, help_text="Asistencia de cada reserva confirmada de la franja."
    )
    topic_ids = _ids_field("Temas de la asignatura trabajados.", default=True)
    material_ids = _ids_field("Material de la asignatura usado.", default=True)
    notes = _notes_field()
    duration_minutes = _duration_field("Duración real; por defecto, la de la franja.")


class SessionUpdateSerializer(serializers.Serializer[dict[str, Any]]):
    """RN-006.8: attendance and slot are final; the rest changes for 48 hours."""

    topic_ids = _ids_field("Temas de la asignatura trabajados.", default=False)
    material_ids = _ids_field("Material de la asignatura usado.", default=False)
    notes = _notes_field()
    duration_minutes = _duration_field("Duración real.")

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if "attendance" in self.initial_data:
            raise serializers.ValidationError({"attendance": [FINAL_ATTENDANCE_MESSAGE]})
        if "slot_id" in self.initial_data:
            raise serializers.ValidationError({"slot_id": [FIXED_SLOT_MESSAGE]})
        return attrs


class MineFilterSerializer(serializers.Serializer[dict[str, Any]]):
    subject = serializers.IntegerField(required=False, help_text="Id de la asignatura.")
    term = serializers.CharField(required=False, help_text="Código del período, p. ej. 2026-2.")


class HistoryFilterSerializer(serializers.Serializer[dict[str, Any]]):
    subject = serializers.IntegerField(required=False, help_text="Id de la asignatura.")
    status = serializers.ChoiceField(required=False, choices=CLOSED_STATUSES)
    student = serializers.UUIDField(
        required=False, help_text="Solo el propio estudiante o un administrador."
    )


class TopicFilterSerializer(serializers.Serializer[dict[str, Any]]):
    subject = serializers.IntegerField(help_text="Id de la asignatura.")


class TopicCreateSerializer(serializers.Serializer[dict[str, Any]]):
    subject_id = serializers.PrimaryKeyRelatedField(queryset=Subject.objects.all())
    # Blank and length are domain rules, so their messages come from there.
    name = serializers.CharField(allow_blank=True, max_length=200, trim_whitespace=False)
