"""Pure catalog rules, free of HTTP (DDD section 4.2)."""

from typing import Protocol

# AAAA-S: four-digit year and semester 1 or 2, e.g. 2026-1 (confirmed 2026-09-29).
TERM_CODE_PATTERN = r"^\d{4}-[12]$"
# Upper-case codes: departments like MAT, subjects like 1000004 or MAT-101, groups like 1 or A.
DEPARTMENT_CODE_PATTERN = r"^[A-Z][A-Z0-9]*$"
SUBJECT_CODE_PATTERN = r"^[A-Z0-9]+(-[A-Z0-9]+)*$"
COURSE_GROUP_PATTERN = r"^[A-Z0-9]+$"

TERM_CODE_MESSAGE = "Usa el formato AAAA-S, con semestre 1 o 2 (por ejemplo 2026-1)."
DEPARTMENT_CODE_MESSAGE = "Usa solo letras y dígitos, empezando por una letra (por ejemplo MAT)."
SUBJECT_CODE_MESSAGE = "Usa solo letras, dígitos y guiones (por ejemplo MAT-101)."
COURSE_GROUP_MESSAGE = "Usa solo letras y dígitos (por ejemplo 1 o A)."
INACTIVE_SUBJECT_MESSAGE = "La asignatura está inactiva y no admite franjas nuevas."


def normalize_code(value: str) -> str:
    """Codes are compared and stored trimmed and in upper case."""
    return value.strip().upper()


class SlotTarget(Protocol):
    is_active: bool


class InactiveSubjectError(Exception):
    """T-02.7: an inactive subject keeps its history but admits no new availability slots."""

    def __init__(self) -> None:
        super().__init__(INACTIVE_SUBJECT_MESSAGE)


def accepts_new_slots(subject: SlotTarget) -> bool:
    return subject.is_active


def ensure_accepts_new_slots(subject: SlotTarget) -> None:
    """Guard for FASE-03: publishing a slot on an inactive subject is rejected (T-02.7)."""
    if not accepts_new_slots(subject):
        raise InactiveSubjectError
