"""Material model invariants enforced by PostgreSQL (T-07.1, RN-008.4, ADR-012)."""

from pathlib import Path
from typing import Any

import pytest
from django.db import IntegrityError, transaction
from pytest_django.fixtures import Settings

from apps.accounts.models import Role
from apps.materials.domain.rules import MaterialKind
from apps.materials.models import Material
from tests.catalog_data import make_subject, make_user
from tests.material_data import make_document, make_video

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _media(settings: Settings, tmp_path: Path) -> None:
    settings.MEDIA_ROOT = tmp_path / "media"


def test_t_07_1_rn_008_4_material_needs_a_subject() -> None:
    author = make_user("sofia@unal.edu.co", Role.Code.MONITOR)
    no_subject: Any = None

    with pytest.raises(IntegrityError), transaction.atomic():
        Material.objects.create(
            subject_id=no_subject, uploaded_by=author, kind=MaterialKind.VIDEO.value,
            title="Clase", youtube_id="dQw4w9WgXcQ",
        )  # fmt: skip


def test_a_document_and_a_video_are_stored() -> None:
    subject = make_subject()
    author = make_user("sofia@unal.edu.co", Role.Code.MONITOR)

    document = make_document(subject, author)
    video = make_video(subject, author)

    assert str(document.file.name).startswith(f"materials/{subject.pk}/")
    assert str(document.file.name).endswith(".pdf")
    assert video.youtube_id == "dQw4w9WgXcQ"


@pytest.mark.parametrize(
    "fields",
    [
        # A video without its YouTube id.
        {"kind": MaterialKind.VIDEO.value, "youtube_id": ""},
        # A document without a file.
        {"kind": MaterialKind.DOCUMENT.value, "size_bytes": 10},
        # A document that also claims a video.
        {"kind": MaterialKind.DOCUMENT.value, "file": "materials/1/a.pdf", "size_bytes": 10,
         "youtube_id": "dQw4w9WgXcQ"},
        # An unknown kind.
        {"kind": "AUDIO", "youtube_id": "dQw4w9WgXcQ"},
    ],
)  # fmt: skip
def test_the_kind_decides_what_the_row_carries(fields: dict[str, object]) -> None:
    subject = make_subject()
    author = make_user("sofia@unal.edu.co", Role.Code.MONITOR)

    with pytest.raises(IntegrityError), transaction.atomic():
        Material.objects.create(subject=subject, uploaded_by=author, title="X", **fields)
