"""Read-side queries of the materials context (CA-HU08-4, ADR-012 item 5).

Listings join what their serializers print, so a page costs a fixed number of queries
(RNF-PER-001).
"""

from django.db.models import Count, Q, QuerySet

from apps.academics.models import AcademicTerm, Course, MonitorAssignment, Subject
from apps.academics.selectors import current_term
from apps.accounts.models import Role, User
from apps.materials.domain.rules import MaterialKind
from apps.materials.models import Material


def materials_with_details() -> QuerySet[Material]:
    return Material.objects.select_related("subject", "uploaded_by")


def subject_materials(subject: Subject, kind: str | None = None) -> QuerySet[Material]:
    """The repository of a subject as anyone signed in sees it: active only, newest first."""
    materials = materials_with_details().filter(subject=subject, is_active=True)
    if kind is not None:
        materials = materials.filter(kind=kind)
    return materials.order_by("-created_at", "id")


def _monitored_subject_ids(user: User, term: AcademicTerm) -> set[int]:
    return set(
        MonitorAssignment.objects.filter(monitor=user, term=term).values_list(
            "subject_id", flat=True
        )
    )


def _taught_subject_ids(user: User, term: AcademicTerm) -> set[int]:
    return set(Course.objects.filter(teacher=user, term=term).values_list("subject_id", flat=True))


def upload_roles(user: User, subject: Subject) -> list[str]:
    """Why the user may add material to `subject` in the current term; empty if they may not.

    ADR-012 item 5: the monitor assigned to the subject and the teacher of one of its courses.
    """
    term = current_term()
    if term is None:
        return []
    roles = []
    if subject.pk in _monitored_subject_ids(user, term):
        roles.append(Role.Code.MONITOR.value)
    if subject.pk in _taught_subject_ids(user, term):
        roles.append(Role.Code.TEACHER.value)
    return roles


def uploadable_subjects(user: User) -> list[Subject]:
    """The active subjects the user may add material to, by name.

    Each carries `roles` (MONITOR and/or TEACHER) and how many active documents and videos
    it already has.
    """
    term = current_term()
    if term is None:
        return []
    monitored = _monitored_subject_ids(user, term)
    taught = _taught_subject_ids(user, term)
    active = Q(materials__is_active=True)
    subjects: list[Subject] = list(
        Subject.objects.filter(pk__in=monitored | taught, is_active=True)
        .select_related("department")
        .annotate(
            document_count=Count(
                "materials", filter=active & Q(materials__kind=MaterialKind.DOCUMENT.value)
            ),
            video_count=Count(
                "materials", filter=active & Q(materials__kind=MaterialKind.VIDEO.value)
            ),
        )
        .order_by("name", "code")
    )
    for subject in subjects:
        subject.roles = [  # type: ignore[attr-defined]
            role
            for role, ids in (
                (Role.Code.MONITOR.value, monitored),
                (Role.Code.TEACHER.value, taught),
            )
            if subject.pk in ids
        ]
    return subjects


def can_remove(user: User, material: Material, *, is_admin: bool | None = None) -> bool:
    """RN-008.5: the author or an administrator. `is_admin` saves a query per row in listings."""
    if material.uploaded_by_id == user.pk:
        return True
    return user.has_role(Role.Code.ADMIN) if is_admin is None else is_admin
