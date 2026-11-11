"""Material aggregate (DDD section 4.7): a document or a YouTube video of a subject."""

import uuid
from pathlib import PurePosixPath
from typing import ClassVar

from django.conf import settings
from django.db import models

from apps.academics.models import Subject
from apps.materials.domain.rules import (
    MAX_DESCRIPTION_LENGTH,
    MAX_FILENAME_LENGTH,
    MAX_TITLE_LENGTH,
    MaterialKind,
    extension_of,
)

KIND_CHOICES = [(kind.value, kind.value) for kind in MaterialKind]
DOCUMENT = MaterialKind.DOCUMENT.value
VIDEO = MaterialKind.VIDEO.value


def material_upload_to(material: "Material", filename: str) -> str:
    """A generated name under the subject's folder: the uploader's name never reaches the disk."""
    ext = extension_of(filename)
    name = f"{uuid.uuid4().hex}.{ext}" if ext else uuid.uuid4().hex
    return str(PurePosixPath("materials", str(material.subject_id), name))


class Material(models.Model):
    """Study material of a subject. Removing it only hides it (RNF-DAT-002, T-07.11)."""

    Kind = MaterialKind

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    subject = models.ForeignKey(
        Subject, on_delete=models.PROTECT, related_name="materials", db_index=False
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="materials"
    )
    kind = models.CharField("tipo", max_length=10, choices=KIND_CHOICES)
    title = models.CharField("título", max_length=MAX_TITLE_LENGTH)
    description = models.TextField(
        "descripción", max_length=MAX_DESCRIPTION_LENGTH, blank=True, default=""
    )
    # DOCUMENT only: the stored file and what was validated when it arrived.
    file = models.FileField("archivo", upload_to=material_upload_to, max_length=255, blank=True)
    original_name = models.CharField(
        "nombre original", max_length=MAX_FILENAME_LENGTH, blank=True, default=""
    )
    content_type = models.CharField("tipo de contenido", max_length=100, blank=True, default="")
    size_bytes = models.PositiveBigIntegerField("tamaño", null=True, blank=True)
    # VIDEO only (ADR-012, item 3).
    youtube_id = models.CharField("video de YouTube", max_length=11, blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField("creado", auto_now_add=True)
    removed_at = models.DateTimeField("retirado", null=True, blank=True)
    removed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="+",
        null=True,
        blank=True,
    )

    class Meta:
        ordering: ClassVar[list[str]] = ["-created_at"]
        indexes: ClassVar[list[models.Index]] = [
            # The repository of a subject, newest first, by kind (CA-HU08-4).
            models.Index(
                fields=["subject", "kind", "-created_at"],
                condition=models.Q(is_active=True),
                name="materials_active_by_subject",
            ),
        ]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.CheckConstraint(
                condition=models.Q(kind__in=[kind.value for kind in MaterialKind]),
                name="materials_kind_valid",
            ),
            # A document carries its file and size; a video, only its YouTube id.
            models.CheckConstraint(
                condition=(
                    models.Q(kind=DOCUMENT, youtube_id="", size_bytes__isnull=False)
                    & ~models.Q(file="")
                )
                | models.Q(kind=VIDEO, file="", size_bytes__isnull=True) & ~models.Q(youtube_id=""),
                name="materials_kind_payload",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.subject.code} · {self.title}"
