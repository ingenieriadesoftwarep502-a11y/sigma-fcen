"""Request and response shapes of the evaluations API (FASE-06 §4).

RF-062: no shape here carries the author of an evaluation. A student reads their own
evaluations (they know they wrote them); the monitor's rating is only an aggregate.
"""

from typing import Any, ClassVar

from rest_framework import serializers

from apps.availability.serializers import MonitorReferenceSerializer
from apps.evaluations.domain.rules import (
    COMMENT_TOO_LONG_MESSAGE,
    MAX_COMMENT_LENGTH,
    RATING_MAX,
    RATING_MIN,
    RATING_RANGE_MESSAGE,
)
from apps.evaluations.models import Evaluation
from apps.reservations.serializers import ReservationSlotSerializer
from apps.tutoring_sessions.models import TutoringSession

# Every way of missing the scale reads the same, as the domain rule says it.
RATING_ERRORS: dict[str, Any] = {
    "invalid": RATING_RANGE_MESSAGE,
    "max_value": RATING_RANGE_MESSAGE,
    "min_value": RATING_RANGE_MESSAGE,
    "max_string_length": RATING_RANGE_MESSAGE,
}


class EvaluationSummarySerializer(serializers.ModelSerializer[Evaluation]):
    """The student's own evaluation, as their history shows it (CA-HU12-1)."""

    class Meta:
        model = Evaluation
        fields: ClassVar[list[str]] = ["id", "rating", "comment", "created_at"]
        read_only_fields = fields


class EvaluationSerializer(serializers.ModelSerializer[Evaluation]):
    """An evaluation as its author reads it: the session, its slot, the rating and comment."""

    session_id = serializers.UUIDField(read_only=True)
    slot = ReservationSlotSerializer(source="session.slot", read_only=True)

    class Meta:
        model = Evaluation
        fields: ClassVar[list[str]] = [
            "id",
            "session_id",
            "slot",
            "rating",
            "comment",
            "created_at",
        ]
        read_only_fields = fields


class EvaluationCreateSerializer(serializers.Serializer[dict[str, Any]]):
    """The author is always the authenticated student, never a field of the body."""

    session_id = serializers.PrimaryKeyRelatedField(
        queryset=TutoringSession.objects.all(), help_text="Id de la sesión a la que asististe."
    )
    rating = serializers.IntegerField(
        min_value=RATING_MIN,
        max_value=RATING_MAX,
        error_messages=RATING_ERRORS,
        help_text=f"Calificación entera de {RATING_MIN} a {RATING_MAX}.",
    )
    comment = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=MAX_COMMENT_LENGTH,
        error_messages={"max_length": COMMENT_TOO_LONG_MESSAGE},
        help_text="Comentario opcional; el monitor no lo ve.",
    )


class MonitorRatingSerializer(serializers.Serializer[dict[str, Any]]):
    """RF-063, RN-007.5: below the minimum, `published` is false and there are no figures."""

    monitor = MonitorReferenceSerializer()
    published = serializers.BooleanField()
    average = serializers.FloatField(
        allow_null=True, help_text="Promedio redondeado a 2 decimales; nulo sin datos suficientes."
    )
    evaluation_count = serializers.IntegerField(
        allow_null=True, help_text="Número de evaluaciones; nulo sin datos suficientes."
    )
    minimum_evaluations = serializers.IntegerField(
        help_text="Evaluaciones necesarias para publicar el promedio."
    )
