"""HTTP endpoints of the materials context (FASE-07 §4).

Every error answers in the SAD §6.3 format: rules 400, authorization 403, size 413.
"""

from collections.abc import Callable
from typing import Any, TypeVar, cast
from uuid import UUID

from django.db.models import QuerySet
from django.http import FileResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import exceptions, generics, serializers, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Role, User
from apps.materials.domain.rules import (
    FILE_FIELD,
    MaterialForbiddenError,
    MaterialKind,
    MaterialRuleError,
    MaterialTooLargeError,
)
from apps.materials.models import Material
from apps.materials.selectors import materials_with_details, subject_materials, uploadable_subjects
from apps.materials.serializers import (
    MaterialCreateSerializer,
    MaterialFilterSerializer,
    MaterialSerializer,
    UploadableSubjectSerializer,
)
from apps.materials.services import add_material, remove_material
from shared.problems import ProblemDetailsMixin

T = TypeVar("T")

PROBLEM = OpenApiResponse(description="Error en el formato de SAD §6.3 (type, title, detail…).")


class FileTooLarge(exceptions.APIException):
    """A 413 that points at the file input, like a validation error would (CA-HU08-3)."""

    status_code = status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
    default_code = "file_too_large"
    default_detail = "El archivo es demasiado grande."

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.errors = {FILE_FIELD: [detail]}


def _user(request: Request) -> User:
    return cast(User, request.user)


def _write(operation: Callable[[], T]) -> T:
    """Maps domain errors to HTTP: rules 400, authorization 403, size 413."""
    try:
        return operation()
    except MaterialRuleError as error:
        raise serializers.ValidationError({error.field: [error.message]}) from error
    except MaterialForbiddenError as error:
        raise exceptions.PermissionDenied(error.message) from error
    except MaterialTooLargeError as error:
        raise FileTooLarge(error.message) from error


def _active(pk: UUID) -> Material:
    material = materials_with_details().filter(pk=pk, is_active=True).first()
    if material is None:
        raise exceptions.NotFound
    return material


def _context(request: Request) -> dict[str, Any]:
    """Who is reading, with their admin role resolved once for the whole page."""
    return {"request": request, "is_admin": _user(request).has_role(Role.Code.ADMIN)}


@extend_schema_view(get=extend_schema(parameters=[MaterialFilterSerializer]))
class MaterialListCreateView(ProblemDetailsMixin, generics.ListAPIView[Material]):
    """The repository of a subject (CA-HU08-4) and the upload into it (CA-HU08-1)."""

    serializer_class = MaterialSerializer
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    def get_queryset(self) -> QuerySet[Material]:
        params = MaterialFilterSerializer(data=self.request.query_params)
        params.is_valid(raise_exception=True)
        return subject_materials(
            params.validated_data["subject"], params.validated_data.get("kind")
        )

    def get_serializer_context(self) -> dict[str, Any]:
        return {**super().get_serializer_context(), **_context(self.request)}

    @extend_schema(
        request={
            "multipart/form-data": MaterialCreateSerializer,
            "application/json": MaterialCreateSerializer,
        },
        responses={201: MaterialSerializer, 400: PROBLEM, 403: PROBLEM, 413: PROBLEM},
    )
    def post(self, request: Request) -> Response:
        serializer = MaterialCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        material = _write(
            lambda: add_material(
                author=_user(request),
                subject=data["subject_id"],
                kind=MaterialKind(data["kind"]),
                title=data["title"],
                description=data.get("description"),
                upload=data.get("file"),
                video_url=data.get("video_url"),
            )
        )
        created = materials_with_details().get(pk=material.pk)
        body = MaterialSerializer(created, context=_context(request)).data
        return Response(body, status=status.HTTP_201_CREATED)


class MaterialDetailView(ProblemDetailsMixin, APIView):
    """The author or an administrator removes material; it only stops being listed."""

    @extend_schema(responses={204: None, 403: PROBLEM, 404: PROBLEM})
    def delete(self, request: Request, pk: UUID) -> Response:
        material = _active(pk)
        _write(lambda: remove_material(material=material, actor=_user(request)))
        return Response(status=status.HTTP_204_NO_CONTENT)


class MaterialDownloadView(ProblemDetailsMixin, APIView):
    """A document, for anyone signed in (CA-HU08-4, RNF-SEC-003). Videos play from YouTube."""

    @extend_schema(
        responses={
            (200, "application/octet-stream"): OpenApiTypes.BINARY,
            401: PROBLEM,
            404: PROBLEM,
        }
    )
    def get(self, request: Request, pk: UUID) -> FileResponse:
        material = _active(pk)
        if material.kind != MaterialKind.DOCUMENT or not material.file:
            raise exceptions.NotFound
        try:
            handle = material.file.open("rb")
        except FileNotFoundError as error:
            raise exceptions.NotFound from error
        response = FileResponse(
            handle,
            as_attachment=True,
            filename=material.original_name,
            content_type=material.content_type,
        )
        # The browser saves it; it never renders nor runs it as a page of this site.
        response["X-Content-Type-Options"] = "nosniff"
        response["Content-Security-Policy"] = "sandbox"
        return response


class UploadableSubjectListView(ProblemDetailsMixin, APIView):
    """Where the signed-in user may add material, with what each subject already holds."""

    @extend_schema(responses={200: UploadableSubjectSerializer(many=True)})
    def get(self, request: Request) -> Response:
        subjects = uploadable_subjects(_user(request))
        return Response(UploadableSubjectSerializer(subjects, many=True).data)  # type: ignore[arg-type]
