"""Builders for material test data (FASE-07). Not collected by pytest."""

from typing import Any

from django.core.files.uploadedfile import SimpleUploadedFile

from apps.academics.models import Subject
from apps.accounts.models import User
from apps.materials.domain.rules import MaterialKind
from apps.materials.models import Material

PDF_BYTES = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"
VIDEO_ID = "dQw4w9WgXcQ"
VIDEO_URL = f"https://www.youtube.com/watch?v={VIDEO_ID}"


def pdf_file(name: str = "Taller 1.pdf", content: bytes = PDF_BYTES) -> SimpleUploadedFile:
    return SimpleUploadedFile(name, content, content_type="application/pdf")


def make_document(
    subject: Subject, author: User, title: str = "Taller 1", **extra: Any
) -> Material:
    """Inserts the row directly, bypassing the service: for state set-up only."""
    upload = extra.pop("file", None) or pdf_file()
    return Material.objects.create(
        subject=subject,
        uploaded_by=author,
        kind=MaterialKind.DOCUMENT.value,
        title=title,
        file=upload,
        original_name=str(upload.name),
        content_type="application/pdf",
        size_bytes=upload.size,
        **extra,
    )


def make_video(
    subject: Subject, author: User, title: str = "Clase grabada", **extra: Any
) -> Material:
    return Material.objects.create(
        subject=subject,
        uploaded_by=author,
        kind=MaterialKind.VIDEO.value,
        title=title,
        youtube_id=extra.pop("youtube_id", VIDEO_ID),
        **extra,
    )
