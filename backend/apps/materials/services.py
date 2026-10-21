"""Material use cases: add a document or a video to a subject, and remove it (FASE-07 §3).

The stored file always gets a generated name (T-07.5); its validated metadata (sanitized
original name, content type guessed from the extension, size) is kept on the row. Removal is
logical: the row and the file stay for traceability (RNF-DAT-002).
"""

import mimetypes
from typing import TypeAlias

from django.conf import settings
from django.core.files.uploadedfile import UploadedFile
from django.db import transaction
from django.utils import timezone

from apps.academics.models import Subject
from apps.accounts.models import User
from apps.materials.domain.rules import (
    FILE_FIELD,
    HEAD_BYTES,
    MaterialForbiddenError,
    MaterialKind,
    MaterialRuleError,
    clean_description,
    clean_title,
    ensure_allowed_file,
    ensure_size,
    sanitize_filename,
    youtube_id_from,
)
from apps.materials.models import Material
from apps.materials.selectors import can_remove, upload_roles

NOT_ALLOWED_MESSAGE = (
    "Solo el monitor asignado o el docente de la asignatura en el período actual pueden "
    "agregar material."
)
NOT_AUTHOR_MESSAGE = "Solo quien subió el material o un administrador puede retirarlo."
FILE_REQUIRED_MESSAGE = "Selecciona el archivo que quieres subir."
FALLBACK_CONTENT_TYPE = "application/octet-stream"

# django-stubs makes UploadedFile generic; at runtime it is a plain class.
Upload: TypeAlias = "UploadedFile[bytes]"


def _read_head(upload: Upload) -> bytes:
    upload.seek(0)
    head = bytes(upload.read(HEAD_BYTES))
    upload.seek(0)
    return head


def _document_fields(upload: "Upload | None") -> dict[str, object]:
    """T-07.2 to T-07.5: size first (cheapest), then the format by name and by content."""
    if upload is None:
        raise MaterialRuleError(FILE_FIELD, FILE_REQUIRED_MESSAGE)
    size = upload.size or 0
    ensure_size(size, max_bytes=settings.MATERIAL_MAX_FILE_BYTES)
    name = sanitize_filename(upload.name or "")
    ensure_allowed_file(name, _read_head(upload))
    content_type, _ = mimetypes.guess_type(name, strict=False)
    return {
        "file": upload,
        "original_name": name,
        "content_type": content_type or FALLBACK_CONTENT_TYPE,
        "size_bytes": size,
    }


def add_material(
    *,
    author: User,
    subject: Subject,
    kind: MaterialKind,
    title: str | None,
    description: str | None = None,
    upload: "Upload | None" = None,
    video_url: str | None = None,
) -> Material:
    """Adds a document or a YouTube video to the subject's repository (CA-HU08-1, RN-008.1)."""
    if not upload_roles(author, subject):
        raise MaterialForbiddenError(NOT_ALLOWED_MESSAGE)
    fields: dict[str, object] = {
        "title": clean_title(title),
        "description": clean_description(description),
    }
    if kind == MaterialKind.DOCUMENT:
        fields |= _document_fields(upload)
    else:
        fields["youtube_id"] = youtube_id_from(video_url)
    return Material.objects.create(subject=subject, uploaded_by=author, kind=kind.value, **fields)


@transaction.atomic
def remove_material(*, material: Material, actor: User) -> Material:
    """Hides the material from the repository (CA-HU08-5, RN-008.5, T-07.11)."""
    if not can_remove(actor, material):
        raise MaterialForbiddenError(NOT_AUTHOR_MESSAGE)
    material.is_active = False
    material.removed_at = timezone.now()
    material.removed_by = actor
    material.save(update_fields=["is_active", "removed_at", "removed_by"])
    return material
