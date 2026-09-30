"""Builders for academic catalog test data (FASE-02). Not collected by pytest."""

from datetime import date, timedelta
from typing import Any

from django.utils import timezone
from rest_framework.test import APIClient

from apps.academics.models import AcademicTerm, Course, Department, MonitorAssignment, Subject
from apps.accounts.models import Role, User, UserRole

PASSWORD = "Str0ng-Passw0rd!"


def client_for(user: User) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def make_user(email: str, *codes: str, first_name: str = "N", last_name: str = "N") -> User:
    user = User.objects.create_user(
        email=email, password=PASSWORD, first_name=first_name, last_name=last_name
    )
    for code in codes:
        UserRole.objects.create(user=user, role=Role.objects.get(code=code))
    return user


def make_department(code: str = "MAT", name: str = "Matemáticas", **extra: Any) -> Department:
    return Department.objects.create(code=code, name=name, **extra)


def make_subject(
    code: str = "1000004",
    name: str = "Cálculo Diferencial",
    *,
    department: Department | None = None,
    credits: int = 4,
    **extra: Any,
) -> Subject:
    if department is None:
        department = Department.objects.filter(code="MAT").first() or make_department()
    return Subject.objects.create(
        code=code, name=name, department=department, credits=credits, **extra
    )


def make_term(
    code: str = "2026-2",
    start: date = date(2026, 8, 3),
    end: date = date(2026, 12, 4),
) -> AcademicTerm:
    return AcademicTerm.objects.create(code=code, start_date=start, end_date=end)


def make_course(
    subject: Subject, term: AcademicTerm, group: str = "1", teacher: User | None = None
) -> Course:
    return Course.objects.create(subject=subject, term=term, group=group, teacher=teacher)


def make_assignment(
    monitor: User, subject: Subject, term: AcademicTerm, committed_hours: int = 8
) -> MonitorAssignment:
    return MonitorAssignment.objects.create(
        monitor=monitor, subject=subject, term=term, committed_hours=committed_hours
    )


def make_current_and_previous_terms() -> tuple[AcademicTerm, AcademicTerm]:
    """A term containing today (2026-2) and an earlier one (2026-1), whatever today is."""
    today = timezone.localdate()
    current = make_term("2026-2", today - timedelta(days=30), today + timedelta(days=60))
    previous = make_term("2026-1", today - timedelta(days=200), today - timedelta(days=100))
    return current, previous
