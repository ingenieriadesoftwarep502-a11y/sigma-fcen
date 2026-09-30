"""Development seed data for the academic catalog (FASE-02 DoD).

Creates the FCEN departments, a sample of subjects and the 2026 terms. Idempotent: rows are
looked up by code and never overwritten, so edits made by an administrator survive a rerun.
It creates no people, courses or monitor assignments.
"""

from datetime import date
from typing import Any

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.academics.models import AcademicTerm, Department, Subject

DEPARTMENTS: dict[str, str] = {
    "MAT": "Matemáticas",
    "FIS": "Física",
    "QUI": "Química",
    "BIO": "Biología",
    "GEO": "Geociencias",
    "EST": "Estadística",
}

# (code, name, credits), grouped by department code. Sample codes, not institutional ones.
SUBJECTS: dict[str, list[tuple[str, str, int]]] = {
    "MAT": [
        ("MAT-101", "Cálculo Diferencial", 4),
        ("MAT-102", "Cálculo Integral", 4),
        ("MAT-103", "Álgebra Lineal", 4),
        ("MAT-201", "Cálculo Vectorial", 4),
        ("MAT-202", "Ecuaciones Diferenciales", 4),
        ("MAT-203", "Matemáticas Discretas", 3),
        ("MAT-301", "Análisis Numérico", 3),
    ],
    "FIS": [
        ("FIS-101", "Física Mecánica", 4),
        ("FIS-102", "Electricidad y Magnetismo", 4),
        ("FIS-103", "Oscilaciones y Ondas", 3),
        ("FIS-201", "Física Moderna", 3),
        ("FIS-202", "Termodinámica", 3),
        ("FIS-203", "Mecánica Clásica", 4),
        ("FIS-301", "Mecánica Cuántica", 4),
    ],
    "QUI": [
        ("QUI-101", "Química General", 4),
        ("QUI-102", "Laboratorio de Química General", 2),
        ("QUI-201", "Química Orgánica", 4),
        ("QUI-202", "Química Analítica", 3),
        ("QUI-203", "Fisicoquímica", 3),
        ("QUI-204", "Química Inorgánica", 3),
        ("QUI-301", "Bioquímica", 3),
    ],
    "BIO": [
        ("BIO-101", "Biología General", 4),
        ("BIO-102", "Biología Celular", 3),
        ("BIO-201", "Genética", 3),
        ("BIO-202", "Ecología", 3),
        ("BIO-203", "Microbiología", 3),
        ("BIO-204", "Botánica", 3),
        ("BIO-205", "Zoología", 3),
    ],
    "GEO": [
        ("GEO-101", "Geología General", 3),
        ("GEO-102", "Mineralogía", 3),
        ("GEO-201", "Petrología", 3),
        ("GEO-202", "Geomorfología", 3),
        ("GEO-203", "Sedimentología", 3),
        ("GEO-204", "Geología Estructural", 3),
        ("GEO-301", "Hidrogeología", 3),
    ],
    "EST": [
        ("EST-101", "Probabilidad", 4),
        ("EST-102", "Estadística Descriptiva", 3),
        ("EST-201", "Inferencia Estadística", 4),
        ("EST-202", "Regresión Lineal", 3),
        ("EST-203", "Muestreo Estadístico", 3),
        ("EST-204", "Diseño de Experimentos", 3),
        ("EST-301", "Series de Tiempo", 3),
    ],
}

TERMS: dict[str, tuple[date, date]] = {
    "2026-1": (date(2026, 2, 2), date(2026, 6, 5)),
    "2026-2": (date(2026, 8, 3), date(2026, 12, 4)),
}


class Command(BaseCommand):
    help = "Crea departamentos, asignaturas y períodos de ejemplo (idempotente, sin personas)."

    @transaction.atomic
    def handle(self, *args: Any, **options: Any) -> None:
        departments: dict[str, Department] = {}
        new_departments = 0
        for code, name in DEPARTMENTS.items():
            departments[code], created = Department.objects.get_or_create(
                code=code, defaults={"name": name}
            )
            new_departments += created

        new_subjects = total_subjects = 0
        for department_code, subjects in SUBJECTS.items():
            for code, name, credits in subjects:
                _, created = Subject.objects.get_or_create(
                    code=code,
                    defaults={
                        "name": name,
                        "credits": credits,
                        "department": departments[department_code],
                    },
                )
                new_subjects += created
                total_subjects += 1

        new_terms = 0
        for code, (start, end) in TERMS.items():
            _, created = AcademicTerm.objects.get_or_create(
                code=code, defaults={"start_date": start, "end_date": end}
            )
            new_terms += created

        self.stdout.write(f"Departamentos: {new_departments} nuevos de {len(DEPARTMENTS)}.")
        self.stdout.write(f"Asignaturas: {new_subjects} nuevos de {total_subjects}.")
        self.stdout.write(f"Períodos: {new_terms} nuevos de {len(TERMS)}.")
