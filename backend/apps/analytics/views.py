"""HTTP endpoints of the teacher's follow-up (FASE-08 §4, HU-09).

Read-only and for the TEACHER role only (RNF-SEC-004). Every query is scoped to the teacher's
own courses on the server; another teacher's course, or an unknown one, answers 403
(RN-009.1, CA-HU09-3). Errors follow SAD §6.3.
"""

from collections.abc import Callable
from typing import Any, TypeVar, cast

from django.db.models import Model, QuerySet
from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import exceptions, generics, serializers

from apps.academics.models import Course, MonitorAssignment
from apps.academics.selectors import current_term
from apps.accounts.models import User
from apps.analytics.domain.rules import TeachingForbiddenError, TeachingRuleError
from apps.analytics.selectors import (
    attended_students,
    course_indicators,
    frequent_topics,
    scoped_monitors,
    scoped_sessions,
    teacher_course,
    teacher_scope,
    teacher_sessions,
)
from apps.analytics.serializers import (
    FrequentTopicSerializer,
    TeachingCourseSerializer,
    TeachingMonitorSerializer,
    TeachingScopeFilterSerializer,
    TeachingSessionFilterSerializer,
    TeachingSessionSerializer,
    TeachingStudentSerializer,
    TeachingTermFilterSerializer,
)
from apps.tutoring_sessions.models import Topic, TutoringSession
from shared.permissions import IsTeacher
from shared.problems import ProblemDetailsMixin

T = TypeVar("T")
M = TypeVar("M", bound=Model)

PROBLEM = OpenApiResponse(description="Error en el formato de SAD §6.3 (type, title, detail…).")


def _read(operation: Callable[[], T]) -> T:
    """Maps domain errors to HTTP: rules 400, another teacher's course 403."""
    try:
        return operation()
    except TeachingRuleError as error:
        raise serializers.ValidationError({error.field: [error.message]}) from error
    except TeachingForbiddenError as error:
        raise exceptions.PermissionDenied(error.message) from error


class _TeachingListView(ProblemDetailsMixin, generics.ListAPIView[M]):
    """A paginated listing over the requesting teacher's courses."""

    permission_classes = (IsTeacher,)
    filter_class: type[serializers.Serializer[Any]] = TeachingScopeFilterSerializer

    def _teacher(self) -> User:
        return cast(User, self.request.user)

    def _params(self) -> dict[str, Any]:
        params = self.filter_class(data=self.request.query_params)
        params.is_valid(raise_exception=True)
        return dict(params.validated_data)

    def _scope(self, params: dict[str, Any]) -> QuerySet[Course]:
        """One course of the teacher, or all of theirs in the term (default: the current)."""
        course = params.pop("course", None)
        term = params.pop("term", None)
        if course is None and term is None:
            term = current_term()
        return _read(lambda: teacher_scope(self._teacher(), course=course, term=term))


@extend_schema_view(get=extend_schema(parameters=[TeachingTermFilterSerializer]))
class TeachingCourseListView(_TeachingListView[Course]):
    """The teacher's courses of a term with their indicators (panel course selector)."""

    serializer_class = TeachingCourseSerializer
    filter_class = TeachingTermFilterSerializer

    def get_queryset(self) -> QuerySet[Course]:
        return course_indicators(self._scope(self._params()))


@extend_schema_view(get=extend_schema(responses={200: TeachingCourseSerializer, 403: PROBLEM}))
class TeachingCourseDetailView(ProblemDetailsMixin, generics.RetrieveAPIView[Course]):
    """One of the teacher's courses with its indicators, whatever its term."""

    permission_classes = (IsTeacher,)
    serializer_class = TeachingCourseSerializer

    def get_object(self) -> Course:
        teacher = cast(User, self.request.user)
        return _read(lambda: teacher_course(teacher, int(self.kwargs["pk"])))


@extend_schema_view(get=extend_schema(parameters=[TeachingScopeFilterSerializer]))
class TeachingMonitorListView(_TeachingListView[MonitorAssignment]):
    """RF-080, CA-HU09-1: the monitors assigned to the teacher's courses."""

    serializer_class = TeachingMonitorSerializer

    def get_queryset(self) -> QuerySet[MonitorAssignment]:
        return scoped_monitors(self._scope(self._params()))


@extend_schema_view(get=extend_schema(parameters=[TeachingSessionFilterSerializer]))
class TeachingSessionListView(_TeachingListView[TutoringSession]):
    """RF-081, CA-HU09-2: the sessions of the teacher's courses, latest first."""

    serializer_class = TeachingSessionSerializer
    filter_class = TeachingSessionFilterSerializer

    def get_queryset(self) -> QuerySet[TutoringSession]:
        params = self._params()
        courses = self._scope(params)
        return _read(lambda: teacher_sessions(scoped_sessions(courses, **params)))


@extend_schema_view(get=extend_schema(parameters=[TeachingScopeFilterSerializer]))
class TeachingStudentListView(_TeachingListView[User]):
    """RF-082: distinct students who attended; `count` is the number of students."""

    serializer_class = TeachingStudentSerializer

    def get_queryset(self) -> QuerySet[User]:
        return attended_students(scoped_sessions(self._scope(self._params())))


@extend_schema_view(get=extend_schema(parameters=[TeachingScopeFilterSerializer]))
class FrequentTopicListView(_TeachingListView[Topic]):
    """RF-083 (confirmed 2026-11-10), CA-HU09-4: topics most repeated first."""

    serializer_class = FrequentTopicSerializer

    def get_queryset(self) -> QuerySet[Topic]:
        return frequent_topics(scoped_sessions(self._scope(self._params())))
