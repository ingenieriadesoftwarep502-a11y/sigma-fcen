"""Development seed data for the catalog (FASE-02 DoD: documented, no real people)."""

from datetime import date
from io import StringIO

import pytest
from django.core.management import call_command

from apps.academics.models import AcademicTerm, Course, Department, MonitorAssignment, Subject
from apps.accounts.models import User

pytestmark = pytest.mark.django_db

FCEN_DEPARTMENTS = {"MAT", "FIS", "QUI", "BIO", "GEO", "EST"}


def _seed() -> str:
    out = StringIO()
    call_command("seed_catalog", stdout=out)
    return out.getvalue()


def test_seed_creates_departments_subjects_and_terms() -> None:
    output = _seed()

    assert set(Department.objects.values_list("code", flat=True)) == FCEN_DEPARTMENTS
    assert Subject.objects.count() >= 40
    # Every department offers subjects, and every seeded row is active.
    assert all(d.subjects.count() >= 4 for d in Department.objects.all())
    assert not Subject.objects.filter(is_active=False).exists()
    terms = {t.code: (t.start_date, t.end_date) for t in AcademicTerm.objects.all()}
    assert set(terms) == {"2026-1", "2026-2"}
    assert terms["2026-1"][0] < terms["2026-1"][1] < terms["2026-2"][0] < terms["2026-2"][1]
    assert terms["2026-2"][0].year == 2026
    assert terms["2026-1"][0] >= date(2026, 1, 1)
    assert "Departamentos" in output


def test_seed_creates_no_people_courses_or_assignments() -> None:
    users_before = User.objects.count()

    _seed()

    assert User.objects.count() == users_before
    assert Course.objects.count() == 0
    assert MonitorAssignment.objects.count() == 0


def test_seed_is_idempotent_and_keeps_admin_edits() -> None:
    _seed()
    counts = (Department.objects.count(), Subject.objects.count(), AcademicTerm.objects.count())
    edited = Subject.objects.order_by("code").first()
    assert edited is not None
    Subject.objects.filter(pk=edited.pk).update(name="Nombre editado", is_active=False)

    output = _seed()

    assert (
        Department.objects.count(),
        Subject.objects.count(),
        AcademicTerm.objects.count(),
    ) == counts
    edited.refresh_from_db()
    assert edited.name == "Nombre editado"
    assert edited.is_active is False
    assert "0 nuevos" in output
