"""HTTP endpoints of the academic catalog context (FASE-02 section 4)."""

from collections.abc import Callable
from typing import Any, TypeVar, cast

from django.db import IntegrityError
from django.db.models import QuerySet
from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import generics, serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import AcademicTerm, Course, Department, MonitorAssignment, Subject
from apps.academics.selectors import (
    assignment_listing,
    catalog_summary,
    course_listing,
    courses_with_details,
    current_term,
    department_listing,
    monitor_assignments,
    subject_listing,
    subjects_with_monitor_count,
    teacher_courses,
)
from apps.academics.serializers import (
    AcademicTermSerializer,
    CatalogSummarySerializer,
    CourseCreateSerializer,
    CourseFilterSerializer,
    CourseSerializer,
    CourseUpdateSerializer,
    DepartmentFilterSerializer,
    DepartmentSerializer,
    MonitorAssignmentCreateSerializer,
    MonitorAssignmentFilterSerializer,
    MonitorAssignmentSerializer,
    MonitorOwnAssignmentSerializer,
    SubjectFilterSerializer,
    SubjectSerializer,
    SubjectWriteSerializer,
    TeacherCourseSerializer,
    TermFilterSerializer,
)
from apps.academics.services import (
    CatalogRuleError,
    create_course,
    create_monitor_assignment,
    update_course,
)
from apps.accounts.models import Role, User
from shared.permissions import IsAdmin, IsAdminOrReadOnly, IsMonitor, IsTeacher

NO_TERMS_MESSAGE = "No hay períodos académicos registrados."
CONFLICT_MESSAGE = "Otro cambio simultáneo lo impidió. Vuelve a intentarlo."

T = TypeVar("T")


def _is_admin(request: Request) -> bool:
    return cast(User, request.user).has_role(Role.Code.ADMIN)


def _query(request: Request, serializer_class: type[serializers.Serializer[Any]]) -> dict[str, Any]:
    """Validates the query string; invalid values become a 400 response."""
    params = serializer_class(data=request.query_params)
    params.is_valid(raise_exception=True)
    return dict(params.validated_data)


def _pop_term(params: dict[str, Any]) -> AcademicTerm | None:
    """The requested term, or the current one when the request names none."""
    term = params.pop("term", None)
    return cast(AcademicTerm | None, term) if term is not None else current_term()


def _write(operation: Callable[[], T]) -> T:
    """Runs a write; rule violations and constraint races become 400 responses."""
    try:
        return operation()
    except CatalogRuleError as error:
        raise serializers.ValidationError({error.field: [error.message]}) from error
    except IntegrityError as error:
        # Two concurrent requests passed validation; the database constraint won.
        raise serializers.ValidationError({"non_field_errors": [CONFLICT_MESSAGE]}) from error


# --- Departments ---------------------------------------------------------------------------


@extend_schema_view(get=extend_schema(parameters=[DepartmentFilterSerializer]))
class DepartmentListCreateView(generics.ListCreateAPIView[Department]):
    """Everyone reads active departments; administrators also see inactive ones and write."""

    permission_classes = (IsAdminOrReadOnly,)
    serializer_class = DepartmentSerializer

    def get_queryset(self) -> QuerySet[Department]:
        if not _is_admin(self.request):
            return department_listing(only_active=True)
        return department_listing(
            only_active=False, **_query(self.request, DepartmentFilterSerializer)
        )

    def perform_create(self, serializer: serializers.BaseSerializer[Department]) -> None:
        _write(serializer.save)


class DepartmentDetailView(generics.RetrieveUpdateAPIView[Department]):
    """Read one department; administrators edit it. PUT is not offered."""

    permission_classes = (IsAdminOrReadOnly,)
    serializer_class = DepartmentSerializer
    http_method_names = ("get", "patch", "head", "options")

    def get_queryset(self) -> QuerySet[Department]:
        return department_listing(only_active=not _is_admin(self.request))

    def perform_update(self, serializer: serializers.BaseSerializer[Department]) -> None:
        _write(serializer.save)


# --- Subjects ------------------------------------------------------------------------------


@extend_schema_view(get=extend_schema(parameters=[SubjectFilterSerializer]))
class SubjectListCreateView(generics.ListAPIView[Subject]):
    """The subject catalog with its filters; administrators create subjects (RF-022)."""

    permission_classes = (IsAdminOrReadOnly,)
    serializer_class = SubjectSerializer

    def get_queryset(self) -> QuerySet[Subject]:
        params = _query(self.request, SubjectFilterSerializer)
        term = _pop_term(params)
        only_active = not _is_admin(self.request)
        if only_active:
            params.pop("active", None)
        return subject_listing(term=term, only_active=only_active, **params)

    @extend_schema(request=SubjectWriteSerializer, responses={201: SubjectSerializer})
    def post(self, request: Request) -> Response:
        serializer = SubjectWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        subject = _write(serializer.save)
        created = subjects_with_monitor_count(current_term()).get(pk=subject.pk)
        return Response(SubjectSerializer(created).data, status=status.HTTP_201_CREATED)


@extend_schema_view(get=extend_schema(parameters=[TermFilterSerializer]))
class SubjectDetailView(generics.RetrieveAPIView[Subject]):
    """Read one subject; administrators edit or deactivate it (T-02.7). PUT is not offered."""

    permission_classes = (IsAdminOrReadOnly,)
    serializer_class = SubjectSerializer

    def get_queryset(self) -> QuerySet[Subject]:
        term = _pop_term(_query(self.request, TermFilterSerializer))
        subjects = subjects_with_monitor_count(term)
        return subjects if _is_admin(self.request) else subjects.filter(is_active=True)

    @extend_schema(request=SubjectWriteSerializer, responses={200: SubjectSerializer})
    def patch(self, request: Request, pk: int) -> Response:
        subject = self.get_object()
        serializer = SubjectWriteSerializer(subject, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        _write(serializer.save)
        return Response(SubjectSerializer(self.get_object()).data)


# --- Terms ---------------------------------------------------------------------------------


class AcademicTermListCreateView(generics.ListCreateAPIView[AcademicTerm]):
    """Every authenticated user lists terms (term switcher); administrators create them."""

    permission_classes = (IsAdminOrReadOnly,)
    serializer_class = AcademicTermSerializer
    queryset = AcademicTerm.objects.order_by("-start_date")

    def perform_create(self, serializer: serializers.BaseSerializer[AcademicTerm]) -> None:
        _write(serializer.save)


class CurrentTermView(APIView):
    """The term containing today; else the latest past one; else the nearest upcoming one."""

    @extend_schema(
        responses={200: AcademicTermSerializer, 404: OpenApiResponse(description="No terms yet")}
    )
    def get(self, request: Request) -> Response:
        term = current_term()
        if term is None:
            return Response({"detail": NO_TERMS_MESSAGE}, status=status.HTTP_404_NOT_FOUND)
        return Response(AcademicTermSerializer(term).data)


# --- Courses -------------------------------------------------------------------------------


@extend_schema_view(get=extend_schema(parameters=[CourseFilterSerializer]))
class CourseListCreateView(generics.ListAPIView[Course]):
    """Courses of one term (the current one by default); administrators only (RF-024)."""

    permission_classes = (IsAdmin,)
    serializer_class = CourseSerializer

    def get_queryset(self) -> QuerySet[Course]:
        params = _query(self.request, CourseFilterSerializer)
        return course_listing(term=_pop_term(params), **params)

    @extend_schema(request=CourseCreateSerializer, responses={201: CourseSerializer})
    def post(self, request: Request) -> Response:
        serializer = CourseCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        course = _write(lambda: create_course(**serializer.validated_data))
        created = courses_with_details().get(pk=course.pk)
        return Response(CourseSerializer(created).data, status=status.HTTP_201_CREATED)


class CourseDetailView(generics.RetrieveAPIView[Course]):
    """Administrators read a course and change its group or teacher. PUT is not offered."""

    permission_classes = (IsAdmin,)
    serializer_class = CourseSerializer

    def get_queryset(self) -> QuerySet[Course]:
        return courses_with_details()

    @extend_schema(request=CourseUpdateSerializer, responses={200: CourseSerializer})
    def patch(self, request: Request, pk: int) -> Response:
        course = self.get_object()
        serializer = CourseUpdateSerializer(data=request.data, context={"course": course})
        serializer.is_valid(raise_exception=True)
        _write(lambda: update_course(course, dict(serializer.validated_data)))
        return Response(CourseSerializer(self.get_object()).data)


@extend_schema_view(get=extend_schema(parameters=[TermFilterSerializer]))
class TeacherCourseListView(generics.ListAPIView[Course]):
    """The requesting teacher's own courses and their monitors (T-02.8, RN-009.1)."""

    permission_classes = (IsTeacher,)
    serializer_class = TeacherCourseSerializer

    def get_queryset(self) -> QuerySet[Course]:
        term = _pop_term(_query(self.request, TermFilterSerializer))
        return teacher_courses(cast(User, self.request.user), term)


# --- Monitor assignments -------------------------------------------------------------------


@extend_schema_view(get=extend_schema(parameters=[MonitorAssignmentFilterSerializer]))
class MonitorAssignmentListCreateView(generics.ListAPIView[MonitorAssignment]):
    """Monitor assignments of one term; administrators authorize monitors (RF-023)."""

    permission_classes = (IsAdmin,)
    serializer_class = MonitorAssignmentSerializer

    def get_queryset(self) -> QuerySet[MonitorAssignment]:
        params = _query(self.request, MonitorAssignmentFilterSerializer)
        return assignment_listing(term=_pop_term(params), **params)

    @extend_schema(
        request=MonitorAssignmentCreateSerializer, responses={201: MonitorAssignmentSerializer}
    )
    def post(self, request: Request) -> Response:
        serializer = MonitorAssignmentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assignment = _write(lambda: create_monitor_assignment(**serializer.validated_data))
        return Response(
            MonitorAssignmentSerializer(assignment).data, status=status.HTTP_201_CREATED
        )


@extend_schema_view(get=extend_schema(parameters=[TermFilterSerializer]))
class MonitorOwnAssignmentListView(generics.ListAPIView[MonitorAssignment]):
    """The requesting monitor's own assignments and their subjects' teachers (RN-009.1)."""

    permission_classes = (IsMonitor,)
    serializer_class = MonitorOwnAssignmentSerializer

    def get_queryset(self) -> QuerySet[MonitorAssignment]:
        term = _pop_term(_query(self.request, TermFilterSerializer))
        return monitor_assignments(cast(User, self.request.user), term)


class MonitorAssignmentDetailView(generics.DestroyAPIView[MonitorAssignment]):
    """Administrators withdraw a monitor's authorization."""

    permission_classes = (IsAdmin,)
    queryset = MonitorAssignment.objects.all()
    serializer_class = MonitorAssignmentSerializer


# --- Summary -------------------------------------------------------------------------------


class CatalogSummaryView(APIView):
    """Headline numbers of the catalog for one term (the current one by default)."""

    permission_classes = (IsAdmin,)

    @extend_schema(parameters=[TermFilterSerializer], responses={200: CatalogSummarySerializer})
    def get(self, request: Request) -> Response:
        term = _pop_term(_query(request, TermFilterSerializer))
        return Response(CatalogSummarySerializer(catalog_summary(term)).data)
