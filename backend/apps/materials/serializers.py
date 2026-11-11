"""Request and response shapes of the materials API (FASE-07 §4)."""

from typing import Any, ClassVar

from rest_framework import serializers

from apps.academics.models import Subject
from apps.academics.serializers import SubjectReferenceSerializer
from apps.availability.serializers import MonitorReferenceSerializer
from apps.materials.domain.rules import (
    MAX_DESCRIPTION_LENGTH,
    MAX_TITLE_LENGTH,
    MaterialKind,
    extension_of,
)
from apps.materials.models import Material
from apps.materials.selectors import can_remove

MAX_URL_LENGTH = 500
KINDS = [kind.value for kind in MaterialKind]


class MaterialSerializer(serializers.ModelSerializer[Material]):
    """A document carries its file data; a video, its YouTube id. The rest is null."""

    subject = SubjectReferenceSerializer(read_only=True)
    # Only the name of who uploaded it, never their email (RNF-SEC).
    uploaded_by = MonitorReferenceSerializer(read_only=True)
    kind = serializers.ChoiceField(choices=KINDS, read_only=True)
    file_name = serializers.SerializerMethodField()
    file_extension = serializers.SerializerMethodField()
    content_type = serializers.SerializerMethodField()
    youtube_id = serializers.SerializerMethodField()
    can_delete = serializers.SerializerMethodField()

    class Meta:
        model = Material
        fields: ClassVar[list[str]] = [
            "id",
            "subject",
            "kind",
            "title",
            "description",
            "uploaded_by",
            "created_at",
            "file_name",
            "file_extension",
            "content_type",
            "size_bytes",
            "youtube_id",
            "can_delete",
        ]
        read_only_fields = fields

    def get_file_name(self, material: Material) -> str | None:
        return material.original_name or None

    def get_file_extension(self, material: Material) -> str | None:
        return extension_of(material.original_name) or None

    def get_content_type(self, material: Material) -> str | None:
        return material.content_type or None

    def get_youtube_id(self, material: Material) -> str | None:
        return material.youtube_id or None

    def get_can_delete(self, material: Material) -> bool:
        """Whether the person reading may remove it: the author or an administrator."""
        request = self.context.get("request")
        if request is None:
            return False
        return can_remove(request.user, material, is_admin=self.context.get("is_admin"))


class MaterialCreateSerializer(serializers.Serializer[dict[str, Any]]):
    """`file` for a DOCUMENT (multipart), `video_url` for a VIDEO; the author is the session."""

    subject_id = serializers.PrimaryKeyRelatedField(
        queryset=Subject.objects.filter(is_active=True),
        help_text="Id de la asignatura a la que se agrega el material.",
    )
    kind = serializers.ChoiceField(choices=KINDS)
    title = serializers.CharField(max_length=MAX_TITLE_LENGTH)
    description = serializers.CharField(
        required=False, allow_blank=True, max_length=MAX_DESCRIPTION_LENGTH
    )
    file = serializers.FileField(
        required=False, help_text="Documento (DOCUMENT): cualquier formato salvo ejecutables."
    )
    video_url = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=MAX_URL_LENGTH,
        help_text="Enlace del video de YouTube (VIDEO).",
    )


class MaterialFilterSerializer(serializers.Serializer[dict[str, Any]]):
    subject = serializers.PrimaryKeyRelatedField(
        queryset=Subject.objects.filter(is_active=True), help_text="Id de la asignatura."
    )
    kind = serializers.ChoiceField(required=False, choices=KINDS)


class UploadableSubjectSerializer(serializers.Serializer[Subject]):
    """A subject where the user may add material, and why (ADR-012, item 5)."""

    id = serializers.IntegerField()
    code = serializers.CharField()
    name = serializers.CharField()
    department = serializers.CharField(source="department.name")
    roles = serializers.ListField(
        child=serializers.CharField(),
        help_text="MONITOR (asignado a la asignatura) y/o TEACHER (docente de un curso).",
    )
    document_count = serializers.IntegerField()
    video_count = serializers.IntegerField()
