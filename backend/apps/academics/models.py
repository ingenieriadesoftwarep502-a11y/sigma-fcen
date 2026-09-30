"""Course aggregate with Department, Subject, AcademicTerm and MonitorAssignment (DDD 4.2)."""

from datetime import date
from typing import ClassVar

from django.conf import settings
from django.core.validators import MinValueValidator, RegexValidator
from django.db import models
from django.db.models.functions import Lower
from django.utils import timezone

from apps.academics.domain.rules import (
    COURSE_GROUP_MESSAGE,
    COURSE_GROUP_PATTERN,
    DEPARTMENT_CODE_MESSAGE,
    DEPARTMENT_CODE_PATTERN,
    SUBJECT_CODE_MESSAGE,
    SUBJECT_CODE_PATTERN,
    TERM_CODE_MESSAGE,
    TERM_CODE_PATTERN,
    accepts_new_slots,
)


class Department(models.Model):
    """An academic unit of the faculty, e.g. Matemáticas (MAT); every subject belongs to one."""

    code = models.CharField(
        "código",
        max_length=10,
        unique=True,
        validators=[RegexValidator(DEPARTMENT_CODE_PATTERN, DEPARTMENT_CODE_MESSAGE)],
    )
    name = models.CharField("nombre", max_length=150)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering: ClassVar[list[str]] = ["name"]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(Lower("name"), name="academics_department_name_ci_unique"),
            models.CheckConstraint(
                condition=models.Q(code__regex=DEPARTMENT_CODE_PATTERN),
                name="academics_department_code_format",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.code} · {self.name}"


class Subject(models.Model):
    """A subject of the curriculum, independent of any term (DDD section 2)."""

    code = models.CharField(
        "código",
        max_length=20,
        unique=True,
        validators=[RegexValidator(SUBJECT_CODE_PATTERN, SUBJECT_CODE_MESSAGE)],
    )
    name = models.CharField("nombre", max_length=200)
    credits = models.PositiveSmallIntegerField("créditos", validators=[MinValueValidator(1)])
    department = models.ForeignKey(Department, on_delete=models.PROTECT, related_name="subjects")
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering: ClassVar[list[str]] = ["name"]
        indexes: ClassVar[list[models.Index]] = [
            # Default ordering of the catalog listing.
            models.Index(fields=["name"], name="academics_subject_name"),
        ]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.CheckConstraint(
                condition=models.Q(credits__gt=0), name="academics_subject_credits_positive"
            ),
            models.CheckConstraint(
                condition=models.Q(code__regex=SUBJECT_CODE_PATTERN),
                name="academics_subject_code_format",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.code} · {self.name}"

    @property
    def accepts_new_slots(self) -> bool:
        """T-02.7: an inactive subject admits no new availability slots."""
        return accepts_new_slots(self)


class AcademicTermQuerySet(models.QuerySet["AcademicTerm"]):
    def current(self, today: date | None = None) -> "AcademicTerm | None":
        """The term containing today; else the latest past one; else the nearest upcoming one."""
        today = today or timezone.localdate()
        return (
            self.filter(start_date__lte=today, end_date__gte=today).order_by("-start_date").first()
            or self.filter(end_date__lt=today).order_by("-end_date").first()
            or self.filter(start_date__gt=today).order_by("start_date").first()
        )


class AcademicTerm(models.Model):
    """A semester in which courses exist, coded AAAA-S (e.g. 2026-1)."""

    code = models.CharField(
        "código",
        max_length=6,
        unique=True,
        validators=[RegexValidator(TERM_CODE_PATTERN, TERM_CODE_MESSAGE)],
    )
    start_date = models.DateField("fecha de inicio")
    end_date = models.DateField("fecha de fin")

    objects = AcademicTermQuerySet.as_manager()

    class Meta:
        ordering: ClassVar[list[str]] = ["-start_date"]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.CheckConstraint(
                condition=models.Q(code__regex=TERM_CODE_PATTERN),
                name="academics_term_code_format",
            ),
            models.CheckConstraint(
                condition=models.Q(end_date__gt=models.F("start_date")),
                name="academics_term_ends_after_start",
            ),
        ]

    def __str__(self) -> str:
        return self.code


class Course(models.Model):
    """A subject offered in one term, in one group, with its responsible teacher."""

    subject = models.ForeignKey(Subject, on_delete=models.PROTECT, related_name="courses")
    term = models.ForeignKey(AcademicTerm, on_delete=models.PROTECT, related_name="courses")
    group = models.CharField(
        "grupo",
        max_length=10,
        validators=[RegexValidator(COURSE_GROUP_PATTERN, COURSE_GROUP_MESSAGE)],
    )
    # Optional until the administrator assigns one; must hold the TEACHER role (RF-024).
    teacher = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="taught_courses",
        null=True,
        blank=True,
        db_index=False,
    )

    class Meta:
        ordering: ClassVar[list[str]] = ["subject__name", "group"]
        indexes: ClassVar[list[models.Index]] = [
            # A term's courses, and a teacher's courses in a term (RN-009.1).
            models.Index(fields=["term", "teacher"], name="academics_course_term_teacher"),
            models.Index(fields=["teacher", "term"], name="academics_course_teacher_term"),
        ]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(
                fields=["subject", "term", "group"], name="academics_course_unique"
            ),
            models.CheckConstraint(
                condition=models.Q(group__regex=COURSE_GROUP_PATTERN),
                name="academics_course_group_format",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.subject.code} · {self.term.code} · G{self.group}"


class MonitorAssignment(models.Model):
    """Authorizes a monitor to attend a subject during a term (RF-023, RN-003.5)."""

    monitor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="monitor_assignments",
        db_index=False,
    )
    subject = models.ForeignKey(
        Subject, on_delete=models.PROTECT, related_name="monitor_assignments", db_index=False
    )
    term = models.ForeignKey(
        AcademicTerm, on_delete=models.PROTECT, related_name="monitor_assignments"
    )
    # Feeds the compliance metric (ADR-013).
    committed_hours = models.PositiveSmallIntegerField(
        "horas comprometidas", validators=[MinValueValidator(1)]
    )

    class Meta:
        ordering: ClassVar[list[str]] = ["subject__name", "monitor__email"]
        indexes: ClassVar[list[models.Index]] = [
            # Monitors per subject in a term: the monitor_count annotations.
            models.Index(fields=["subject", "term"], name="academics_assign_subject_term"),
        ]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(
                fields=["monitor", "subject", "term"], name="academics_assignment_unique"
            ),
            models.CheckConstraint(
                condition=models.Q(committed_hours__gt=0),
                name="academics_assignment_hours_positive",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.monitor} · {self.subject.code} · {self.term.code}"
