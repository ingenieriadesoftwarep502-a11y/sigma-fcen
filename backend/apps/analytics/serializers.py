"""Request and response shapes of the teacher's follow-up API (FASE-08 §4).

RNF-SEC-004: a student appears only by name (no id, no email) and only when they attended.
Nothing here carries an evaluation (RF-062) or the monitor's notes: the teacher reads the
follow-up, not the private side of each session.
"""

from typing import Any, ClassVar

from rest_framework import serializers

from apps.academics.models import AcademicTerm, Course, MonitorAssignment
from apps.academics.serializers import UNKNOWN_TERM_MESSAGE, SubjectReferenceSerializer
from apps.accounts.models import User
from apps.availability.serializers import MonitorReferenceSerializer
from apps.tutoring_sessions.models import SessionAttendance, Topic, TutoringSession
from apps.tutoring_sessions.serializers import TopicSerializer


def _full_name(user: User) -> str:
    return f"{user.first_name} {user.last_name}".strip()


def _term_field(**kwargs: Any) -> serializers.SlugRelatedField[AcademicTerm]:
    return serializers.SlugRelatedField(
        slug_field="code",
        queryset=AcademicTerm.objects.all(),
        error_messages={"does_not_exist": UNKNOWN_TERM_MESSAGE},
        **kwargs,
    )


def _term_code() -> serializers.SlugRelatedField[AcademicTerm]:
    return serializers.SlugRelatedField(slug_field="code", read_only=True)


# --- Query strings ---------------------------------------------------------------------------


class TeachingTermFilterSerializer(serializers.Serializer[dict[str, Any]]):
    term = _term_field(required=False, help_text="Código del período; por defecto, el actual.")


class TeachingScopeFilterSerializer(TeachingTermFilterSerializer):
    course = serializers.IntegerField(
        required=False,
        min_value=1,
        help_text="Id de uno de tus cursos; si se indica, manda sobre el período.",
    )


class TeachingSessionFilterSerializer(TeachingScopeFilterSerializer):
    date_from = serializers.DateField(
        required=False, help_text="Desde este día (hora de Bogotá), incluido."
    )
    date_to = serializers.DateField(
        required=False, help_text="Hasta este día (hora de Bogotá), incluido."
    )


# --- Responses -------------------------------------------------------------------------------


class TeachingCourseSerializer(serializers.ModelSerializer[Course]):
    """One of the teacher's courses with its follow-up indicators."""

    subject = SubjectReferenceSerializer(read_only=True)
    term = _term_code()
    monitor_count = serializers.IntegerField(read_only=True, help_text="Monitores asignados.")
    session_count = serializers.IntegerField(read_only=True, help_text="Sesiones registradas.")
    student_count = serializers.IntegerField(
        read_only=True, help_text="Estudiantes distintos que asistieron."
    )

    class Meta:
        model = Course
        fields: ClassVar[list[str]] = [
            "id",
            "subject",
            "term",
            "group",
            "monitor_count",
            "session_count",
            "student_count",
        ]
        read_only_fields = fields


class TeachingMonitorSerializer(serializers.ModelSerializer[MonitorAssignment]):
    """RF-080: a monitor assigned to a subject and term of the teacher's courses."""

    id = serializers.UUIDField(source="monitor.id", read_only=True)
    full_name = serializers.SerializerMethodField()
    email = serializers.EmailField(source="monitor.email", read_only=True)
    subject = SubjectReferenceSerializer(read_only=True)
    term = _term_code()
    session_count = serializers.IntegerField(
        read_only=True, help_text="Sesiones que registró en la asignatura y el período."
    )

    class Meta:
        model = MonitorAssignment
        fields: ClassVar[list[str]] = [
            "id",
            "full_name",
            "email",
            "subject",
            "term",
            "committed_hours",
            "session_count",
        ]
        read_only_fields = fields

    def get_full_name(self, assignment: MonitorAssignment) -> str:
        return _full_name(assignment.monitor)


class AttendeeSerializer(serializers.Serializer[SessionAttendance]):
    """A student who attended: only the name (RNF-SEC-004)."""

    full_name = serializers.SerializerMethodField()

    def get_full_name(self, row: SessionAttendance) -> str:
        return _full_name(row.reservation.student)


class TeachingSessionSerializer(serializers.ModelSerializer[TutoringSession]):
    """CA-HU09-2: date, monitor, students who attended and topics of a session."""

    starts_at = serializers.DateTimeField(source="slot.starts_at", read_only=True)
    ends_at = serializers.DateTimeField(source="slot.ends_at", read_only=True)
    subject = SubjectReferenceSerializer(source="slot.subject", read_only=True)
    term = serializers.CharField(source="slot.term.code", read_only=True)
    monitor = MonitorReferenceSerializer(source="slot.monitor", read_only=True)
    topics = TopicSerializer(many=True, read_only=True)
    # Prefetched by selectors.teacher_sessions: only ATTENDED rows.
    students = AttendeeSerializer(source="attendees", many=True, read_only=True)

    class Meta:
        model = TutoringSession
        fields: ClassVar[list[str]] = [
            "id",
            "starts_at",
            "ends_at",
            "subject",
            "term",
            "monitor",
            "topics",
            "students",
            "duration_minutes",
        ]
        read_only_fields = fields


class TeachingStudentSerializer(serializers.Serializer[User]):
    """RF-082: a distinct student who attended; only the name and their attendance."""

    full_name = serializers.SerializerMethodField()
    session_count = serializers.IntegerField(help_text="Sesiones a las que asistió.")
    last_attended_at = serializers.DateTimeField(help_text="Inicio de su última sesión.")

    def get_full_name(self, user: User) -> str:
        return _full_name(user)


class FrequentTopicSerializer(serializers.ModelSerializer[Topic]):
    """RF-083: a topic and how many of the scope's sessions worked on it."""

    subject = SubjectReferenceSerializer(read_only=True)
    session_count = serializers.IntegerField(
        read_only=True, help_text="Sesiones en las que se trabajó el tema."
    )

    class Meta:
        model = Topic
        fields: ClassVar[list[str]] = ["id", "name", "subject", "session_count"]
        read_only_fields = fields
