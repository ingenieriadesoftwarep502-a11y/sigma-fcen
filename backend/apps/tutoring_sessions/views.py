"""HTTP endpoints of the tutoring-sessions context (FASE-05 §4.3).

Every error answers in the SAD §6.3 format: rules 400, authorization 403, state 409.
"""

from collections.abc import Callable
from typing import Any, TypeVar, cast
from uuid import UUID

from django.db.models import QuerySet
from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import exceptions, generics, serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Role, User
from apps.reservations.models import Reservation
from apps.tutoring_sessions.domain.rules import (
    AttendanceStatus,
    SessionConflictError,
    SessionForbiddenError,
    SessionRuleError,
)
from apps.tutoring_sessions.models import TutoringSession
from apps.tutoring_sessions.selectors import (
    attended_by,
    monitor_sessions,
    sees_everything,
    sessions_with_details,
    student_history,
    subject_topics,
)
from apps.tutoring_sessions.serializers import (
    FULL_VIEW,
    VIEWER,
    HistoryFilterSerializer,
    HistoryItemSerializer,
    MineFilterSerializer,
    SessionCreateSerializer,
    SessionUpdateSerializer,
    TopicCreateSerializer,
    TopicFilterSerializer,
    TopicSerializer,
    TutoringSessionSerializer,
)
from apps.tutoring_sessions.services import create_topic, record_session, update_session
from shared.problems import Conflict, ProblemDetailsMixin

T = TypeVar("T")

NOT_PARTICIPANT_MESSAGE = "No participaste en esta sesión."
FOREIGN_HISTORY_MESSAGE = "Solo puedes consultar tu propio historial."

PROBLEM = OpenApiResponse(description="Error en el formato de SAD §6.3 (type, title, detail…).")


def _user(request: Request) -> User:
    return cast(User, request.user)


def _write(operation: Callable[[], T]) -> T:
    """Maps domain errors to HTTP: rules 400, authorization 403, state 409."""
    try:
        return operation()
    except SessionRuleError as error:
        raise serializers.ValidationError({error.field: [error.message]}) from error
    except SessionForbiddenError as error:
        raise exceptions.PermissionDenied(error.message) from error
    except SessionConflictError as error:
        raise Conflict(error.message, error.code) from error


def _session(pk: UUID) -> TutoringSession:
    session = sessions_with_details().filter(pk=pk).first()
    if session is None:
        raise exceptions.NotFound
    return session


def _render(request: Request, session: TutoringSession) -> dict[str, Any]:
    """RN-006.9: the monitor, the course's teacher and admins see all; a student, their part."""
    user = _user(request)
    full = sees_everything(user, session)
    if not full and not attended_by(user, session):
        raise exceptions.PermissionDenied(NOT_PARTICIPANT_MESSAGE)
    context = {FULL_VIEW: full, VIEWER: user}
    return dict(TutoringSessionSerializer(session, context=context).data)


class SessionCreateView(ProblemDetailsMixin, APIView):
    """The slot's monitor records the session and closes its reservations (HU-06)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        request=SessionCreateSerializer,
        responses={201: TutoringSessionSerializer, 400: PROBLEM, 403: PROBLEM, 409: PROBLEM},
    )
    def post(self, request: Request) -> Response:
        serializer = SessionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        marks = [
            (mark["reservation_id"], AttendanceStatus(mark["attendance"]))
            for mark in data["attendance"]
        ]
        session = _write(
            lambda: record_session(
                monitor=_user(request),
                slot=data["slot_id"],
                attendance=marks,
                topic_ids=data["topic_ids"],
                material_ids=data["material_ids"],
                notes=data.get("notes"),
                duration_minutes=data.get("duration_minutes"),
            )
        )
        return Response(_render(request, _session(session.pk)), status=status.HTTP_201_CREATED)


class SessionDetailView(ProblemDetailsMixin, APIView):
    """Read a session as a participant, teacher or admin; the monitor corrects it for 48 h."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(responses={200: TutoringSessionSerializer, 403: PROBLEM, 404: PROBLEM})
    def get(self, request: Request, pk: UUID) -> Response:
        return Response(_render(request, _session(pk)))

    @extend_schema(
        request=SessionUpdateSerializer,
        responses={200: TutoringSessionSerializer, 400: PROBLEM, 403: PROBLEM, 409: PROBLEM},
    )
    def patch(self, request: Request, pk: UUID) -> Response:
        session = _session(pk)
        serializer = SessionUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        _write(
            lambda: update_session(
                session=session, actor=_user(request), changes=serializer.validated_data
            )
        )
        return Response(_render(request, _session(pk)))


@extend_schema_view(get=extend_schema(parameters=[MineFilterSerializer]))
class MySessionListView(ProblemDetailsMixin, generics.ListAPIView[TutoringSession]):
    """The sessions of the monitor's slots, latest recorded first."""

    permission_classes = (IsAuthenticated,)
    serializer_class = TutoringSessionSerializer

    def get_queryset(self) -> QuerySet[TutoringSession]:
        params = MineFilterSerializer(data=self.request.query_params)
        params.is_valid(raise_exception=True)
        return monitor_sessions(_user(self.request), **params.validated_data)


@extend_schema_view(get=extend_schema(parameters=[HistoryFilterSerializer]))
class HistoryView(ProblemDetailsMixin, generics.ListAPIView[Reservation]):
    """HU-12: a student's closed reservations, with the session they attended."""

    permission_classes = (IsAuthenticated,)
    serializer_class = HistoryItemSerializer

    def get_queryset(self) -> QuerySet[Reservation]:
        params = HistoryFilterSerializer(data=self.request.query_params)
        params.is_valid(raise_exception=True)
        filters = dict(params.validated_data)
        user = _user(self.request)
        student_id = filters.pop("student", None) or user.pk
        # CA-HU12-3: only an administrator reads someone else's history.
        if student_id != user.pk and not user.has_role(Role.Code.ADMIN):
            raise exceptions.PermissionDenied(FOREIGN_HISTORY_MESSAGE)
        return student_history(student_id, **filters)


class TopicListCreateView(ProblemDetailsMixin, APIView):
    """A subject's topic catalog; the assigned monitor or an admin add to it (T-05.21)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        parameters=[TopicFilterSerializer],
        responses={200: TopicSerializer(many=True), 400: PROBLEM},
    )
    def get(self, request: Request) -> Response:
        params = TopicFilterSerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        topics = subject_topics(params.validated_data["subject"])
        return Response(TopicSerializer(topics, many=True).data)

    @extend_schema(
        request=TopicCreateSerializer,
        responses={200: TopicSerializer, 201: TopicSerializer, 400: PROBLEM, 403: PROBLEM},
    )
    def post(self, request: Request) -> Response:
        serializer = TopicCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        topic, created = _write(
            lambda: create_topic(
                actor=_user(request), subject=data["subject_id"], name=data["name"]
            )
        )
        code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(TopicSerializer(topic).data, status=code)
