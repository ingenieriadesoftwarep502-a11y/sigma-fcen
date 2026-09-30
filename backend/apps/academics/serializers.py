"""Request and response shapes of the academic catalog API (FASE-02 section 4)."""

import re
from typing import Any, ClassVar

from django.db.models import Model
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.academics.domain.rules import (
    COURSE_GROUP_MESSAGE,
    COURSE_GROUP_PATTERN,
    DEPARTMENT_CODE_MESSAGE,
    DEPARTMENT_CODE_PATTERN,
    SUBJECT_CODE_MESSAGE,
    SUBJECT_CODE_PATTERN,
    TERM_CODE_MESSAGE,
    TERM_CODE_PATTERN,
    normalize_code,
)
from apps.academics.models import AcademicTerm, Course, Department, MonitorAssignment, Subject
from apps.accounts.models import User
from apps.accounts.serializers import UserReferenceSerializer
from shared.fields import StrictBooleanField

DUPLICATE_DEPARTMENT_CODE_MESSAGE = "Ya existe un departamento con este código."
DUPLICATE_DEPARTMENT_NAME_MESSAGE = "Ya existe un departamento con este nombre."
DUPLICATE_SUBJECT_CODE_MESSAGE = "Ya existe una asignatura con este código."
DUPLICATE_TERM_CODE_MESSAGE = "Ya existe un período con este código."
TERM_DATES_MESSAGE = "La fecha de fin debe ser posterior al inicio."
DUPLICATE_COURSE_MESSAGE = "Ya existe un curso de esta asignatura con ese grupo en el período."
DUPLICATE_ASSIGNMENT_MESSAGE = "El monitor ya está asignado a esta asignatura en el período."
UNKNOWN_TERM_MESSAGE = "No existe un período con este código."

ORDERING_CHOICES = ["code", "name", "-monitor_count"]


def _unique_code(
    value: str,
    *,
    model: type[Model],
    pattern: str,
    format_message: str,
    duplicate_message: str,
    instance: Model | None,
) -> str:
    """Normalizes a code, checks its format and that no other row already uses it."""
    code = normalize_code(value)
    if not re.fullmatch(pattern, code):
        raise serializers.ValidationError(format_message)
    others = model._default_manager.filter(code=code)
    if instance is not None:
        others = others.exclude(pk=instance.pk)
    if others.exists():
        raise serializers.ValidationError(duplicate_message)
    return code


def _term_field(**kwargs: Any) -> serializers.SlugRelatedField[AcademicTerm]:
    """A term given by its code, e.g. 2026-1."""
    return serializers.SlugRelatedField(
        slug_field="code",
        queryset=AcademicTerm.objects.all(),
        error_messages={"does_not_exist": UNKNOWN_TERM_MESSAGE},
        **kwargs,
    )


# --- Departments ---------------------------------------------------------------------------


class DepartmentSerializer(serializers.ModelSerializer[Department]):
    code = serializers.CharField(max_length=10)
    name = serializers.CharField(max_length=150)

    class Meta:
        model = Department
        fields: ClassVar[list[str]] = ["id", "code", "name", "is_active"]

    def validate_code(self, value: str) -> str:
        return _unique_code(
            value,
            model=Department,
            pattern=DEPARTMENT_CODE_PATTERN,
            format_message=DEPARTMENT_CODE_MESSAGE,
            duplicate_message=DUPLICATE_DEPARTMENT_CODE_MESSAGE,
            instance=self.instance,
        )

    def validate_name(self, value: str) -> str:
        others = Department.objects.filter(name__iexact=value)
        if self.instance is not None:
            others = others.exclude(pk=self.instance.pk)
        if others.exists():
            raise serializers.ValidationError(DUPLICATE_DEPARTMENT_NAME_MESSAGE)
        return value


class DepartmentReferenceSerializer(serializers.ModelSerializer[Department]):
    class Meta:
        model = Department
        fields: ClassVar[list[str]] = ["id", "code", "name"]
        read_only_fields = fields


class DepartmentFilterSerializer(serializers.Serializer[dict[str, Any]]):
    active = StrictBooleanField(required=False, help_text="Solo administradores.")


# --- Subjects ------------------------------------------------------------------------------


class SubjectSerializer(serializers.ModelSerializer[Subject]):
    department = DepartmentReferenceSerializer(read_only=True)
    monitor_count = serializers.IntegerField(
        read_only=True, help_text="Asignaciones de monitoría de la asignatura en el período."
    )

    class Meta:
        model = Subject
        fields: ClassVar[list[str]] = [
            "id",
            "code",
            "name",
            "credits",
            "is_active",
            "department",
            "monitor_count",
        ]
        read_only_fields = fields


class SubjectWriteSerializer(serializers.ModelSerializer[Subject]):
    code = serializers.CharField(max_length=20)

    class Meta:
        model = Subject
        fields: ClassVar[list[str]] = ["code", "name", "credits", "department", "is_active"]

    def validate_code(self, value: str) -> str:
        return _unique_code(
            value,
            model=Subject,
            pattern=SUBJECT_CODE_PATTERN,
            format_message=SUBJECT_CODE_MESSAGE,
            duplicate_message=DUPLICATE_SUBJECT_CODE_MESSAGE,
            instance=self.instance,
        )


class SubjectSummarySerializer(serializers.ModelSerializer[Subject]):
    department = DepartmentReferenceSerializer(read_only=True)

    class Meta:
        model = Subject
        fields: ClassVar[list[str]] = ["id", "code", "name", "credits", "department"]
        read_only_fields = fields


class SubjectReferenceSerializer(serializers.ModelSerializer[Subject]):
    class Meta:
        model = Subject
        fields: ClassVar[list[str]] = ["id", "code", "name"]
        read_only_fields = fields


class TermFilterSerializer(serializers.Serializer[dict[str, Any]]):
    term = _term_field(required=False, help_text="Código del período; por defecto, el actual.")


class SubjectFilterSerializer(TermFilterSerializer):
    search = serializers.CharField(
        required=False, allow_blank=True, max_length=100, help_text="Busca en código y nombre."
    )
    department = serializers.CharField(
        required=False, max_length=20, help_text="Id o código del departamento."
    )
    active = StrictBooleanField(required=False, help_text="Solo administradores.")
    credits = serializers.IntegerField(required=False, min_value=1)
    has_monitors = StrictBooleanField(required=False)
    ordering = serializers.ChoiceField(choices=ORDERING_CHOICES, default="name")


# --- Terms ---------------------------------------------------------------------------------


class AcademicTermSerializer(serializers.ModelSerializer[AcademicTerm]):
    code = serializers.CharField(max_length=6, help_text="Formato AAAA-S, por ejemplo 2026-1.")

    class Meta:
        model = AcademicTerm
        fields: ClassVar[list[str]] = ["id", "code", "start_date", "end_date"]

    def validate_code(self, value: str) -> str:
        return _unique_code(
            value,
            model=AcademicTerm,
            pattern=TERM_CODE_PATTERN,
            format_message=TERM_CODE_MESSAGE,
            duplicate_message=DUPLICATE_TERM_CODE_MESSAGE,
            instance=self.instance,
        )

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if attrs["end_date"] <= attrs["start_date"]:
            raise serializers.ValidationError({"end_date": [TERM_DATES_MESSAGE]})
        return attrs


# --- Courses -------------------------------------------------------------------------------


class CourseSerializer(serializers.ModelSerializer[Course]):
    subject = SubjectSummarySerializer(read_only=True)
    term: serializers.SlugRelatedField[AcademicTerm] = serializers.SlugRelatedField(
        slug_field="code", read_only=True
    )
    teacher = UserReferenceSerializer(read_only=True, allow_null=True)
    monitor_count = serializers.IntegerField(
        read_only=True, help_text="Monitores asignados a la asignatura en el período del curso."
    )

    class Meta:
        model = Course
        fields: ClassVar[list[str]] = ["id", "subject", "term", "group", "teacher", "monitor_count"]
        read_only_fields = fields


def _normalized_group(value: str) -> str:
    group = normalize_code(value)
    if not re.fullmatch(COURSE_GROUP_PATTERN, group):
        raise serializers.ValidationError(COURSE_GROUP_MESSAGE)
    return group


def _teacher_field(**kwargs: Any) -> serializers.PrimaryKeyRelatedField[User]:
    return serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        allow_null=True,
        help_text="Id de un usuario Docente.",
        **kwargs,
    )


def _ensure_unique_course(subject: Subject, term: AcademicTerm, group: str, exclude: Any) -> None:
    others = Course.objects.filter(subject=subject, term=term, group=group).exclude(pk=exclude)
    if others.exists():
        raise serializers.ValidationError(DUPLICATE_COURSE_MESSAGE)


class CourseCreateSerializer(serializers.Serializer[Course]):
    subject = serializers.PrimaryKeyRelatedField(queryset=Subject.objects.all())
    term = _term_field()
    group = serializers.CharField(max_length=10)
    teacher = _teacher_field(required=False, default=None)

    def validate_group(self, value: str) -> str:
        return _normalized_group(value)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        _ensure_unique_course(attrs["subject"], attrs["term"], attrs["group"], exclude=None)
        return attrs


class CourseUpdateSerializer(serializers.Serializer[Course]):
    group = serializers.CharField(max_length=10, required=False)
    teacher = _teacher_field(required=False)

    def validate_group(self, value: str) -> str:
        return _normalized_group(value)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        course: Course = self.context["course"]
        if "group" in attrs:
            _ensure_unique_course(course.subject, course.term, attrs["group"], exclude=course.pk)
        return attrs


class CourseFilterSerializer(TermFilterSerializer):
    search = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=100,
        help_text="Busca en código y nombre de la asignatura y en nombre y correo del docente.",
    )
    department = serializers.CharField(
        required=False, max_length=20, help_text="Id o código del departamento."
    )
    without_teacher = StrictBooleanField(required=False)
    without_monitors = StrictBooleanField(required=False)
    ordering = serializers.ChoiceField(choices=ORDERING_CHOICES, default="name")


# --- Monitor assignments -------------------------------------------------------------------


class AssignedMonitorSerializer(serializers.Serializer[MonitorAssignment]):
    """A monitor of one of the teacher's courses; `id` is the monitor's user id."""

    id = serializers.UUIDField(source="monitor.id")
    full_name = serializers.SerializerMethodField()
    email = serializers.EmailField(source="monitor.email")
    committed_hours = serializers.IntegerField()

    def get_full_name(self, assignment: MonitorAssignment) -> str:
        monitor = assignment.monitor
        return f"{monitor.first_name} {monitor.last_name}".strip()


class TeacherCourseSerializer(serializers.ModelSerializer[Course]):
    subject = SubjectSummarySerializer(read_only=True)
    term: serializers.SlugRelatedField[AcademicTerm] = serializers.SlugRelatedField(
        slug_field="code", read_only=True
    )
    monitors = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields: ClassVar[list[str]] = ["id", "subject", "term", "group", "monitors"]
        read_only_fields = fields

    @extend_schema_field(AssignedMonitorSerializer(many=True))
    def get_monitors(self, course: Course) -> list[dict[str, Any]]:
        # Prefetched by selectors.teacher_courses for the requested term.
        assignments: Any = getattr(course.subject, "term_assignments", [])
        return list(AssignedMonitorSerializer(assignments, many=True).data)


class MonitorAssignmentSerializer(serializers.ModelSerializer[MonitorAssignment]):
    monitor = UserReferenceSerializer(read_only=True)
    subject = SubjectReferenceSerializer(read_only=True)
    term: serializers.SlugRelatedField[AcademicTerm] = serializers.SlugRelatedField(
        slug_field="code", read_only=True
    )

    class Meta:
        model = MonitorAssignment
        fields: ClassVar[list[str]] = ["id", "monitor", "subject", "term", "committed_hours"]
        read_only_fields = fields


class SubjectTeacherSerializer(serializers.Serializer[Course]):
    """A teacher of the monitor's subject in the term; `id` is the teacher's user id."""

    id = serializers.UUIDField(source="teacher.id")
    full_name = serializers.SerializerMethodField()
    email = serializers.EmailField(source="teacher.email")
    group = serializers.CharField()

    def get_full_name(self, course: Course) -> str:
        teacher = course.teacher
        return f"{teacher.first_name} {teacher.last_name}".strip() if teacher else ""


class MonitorOwnAssignmentSerializer(serializers.ModelSerializer[MonitorAssignment]):
    subject = SubjectSummarySerializer(read_only=True)
    term: serializers.SlugRelatedField[AcademicTerm] = serializers.SlugRelatedField(
        slug_field="code", read_only=True
    )
    teachers = serializers.SerializerMethodField()

    class Meta:
        model = MonitorAssignment
        fields: ClassVar[list[str]] = ["id", "subject", "term", "committed_hours", "teachers"]
        read_only_fields = fields

    @extend_schema_field(SubjectTeacherSerializer(many=True))
    def get_teachers(self, assignment: MonitorAssignment) -> list[dict[str, Any]]:
        # Prefetched by selectors.monitor_assignments for the requested term.
        courses: Any = getattr(assignment.subject, "term_courses", [])
        return list(SubjectTeacherSerializer(courses, many=True).data)


class MonitorAssignmentCreateSerializer(serializers.Serializer[MonitorAssignment]):
    monitor = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), help_text="Id de un usuario Monitor."
    )
    subject = serializers.PrimaryKeyRelatedField(queryset=Subject.objects.all())
    term = _term_field()
    committed_hours = serializers.IntegerField(min_value=1, max_value=32767)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        duplicate = MonitorAssignment.objects.filter(
            monitor=attrs["monitor"], subject=attrs["subject"], term=attrs["term"]
        ).exists()
        if duplicate:
            raise serializers.ValidationError(DUPLICATE_ASSIGNMENT_MESSAGE)
        return attrs


class MonitorAssignmentFilterSerializer(TermFilterSerializer):
    subject = serializers.IntegerField(required=False, min_value=1, help_text="Id de asignatura.")
    monitor = serializers.UUIDField(required=False, help_text="Id del monitor.")
    search = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=100,
        help_text="Busca en nombre y correo del monitor y en código y nombre de la asignatura.",
    )


# --- Summary -------------------------------------------------------------------------------


class CatalogSummarySerializer(serializers.Serializer[dict[str, Any]]):
    term = serializers.CharField(allow_null=True, help_text="Código del período resumido.")
    subjects_active = serializers.IntegerField()
    departments_active = serializers.IntegerField()
    courses = serializers.IntegerField()
    courses_without_teacher = serializers.IntegerField()
    courses_without_monitor = serializers.IntegerField()
    monitor_assignments = serializers.IntegerField()
    committed_hours_total = serializers.IntegerField()
