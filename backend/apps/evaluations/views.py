"""HTTP endpoints of the evaluations context (FASE-06 §4).

Every error answers in the SAD §6.3 format: rules 400, authorization 403, state 409.
RF-062: the monitor's rating is an aggregate; no endpoint shows an author to anyone else.
"""

from typing import cast
from uuid import UUID

from django.db.models import QuerySet
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import exceptions, generics, serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.evaluations.domain.rules import (
    EvaluationConflictError,
    EvaluationForbiddenError,
    EvaluationRuleError,
)
from apps.evaluations.models import Evaluation
from apps.evaluations.selectors import (
    monitor_rating,
    own_evaluations,
    pending_evaluations,
    rated_monitor,
)
from apps.evaluations.serializers import (
    EvaluationCreateSerializer,
    EvaluationSerializer,
    MonitorRatingSerializer,
)
from apps.evaluations.services import submit_evaluation
from apps.reservations.models import Reservation
from apps.tutoring_sessions.serializers import HistoryItemSerializer
from shared.problems import Conflict, ProblemDetailsMixin

PROBLEM = OpenApiResponse(description="Error en el formato de SAD §6.3 (type, title, detail…).")


def _user(request: Request) -> User:
    return cast(User, request.user)


class EvaluationCreateView(ProblemDetailsMixin, APIView):
    """A student rates a session they attended, once (HU-07, CA-HU07-1 to CA-HU07-5)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        request=EvaluationCreateSerializer,
        responses={201: EvaluationSerializer, 400: PROBLEM, 403: PROBLEM, 409: PROBLEM},
    )
    def post(self, request: Request) -> Response:
        serializer = EvaluationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            evaluation = submit_evaluation(
                student=_user(request),
                session=data["session_id"],
                rating=data["rating"],
                comment=data.get("comment"),
            )
        except EvaluationRuleError as error:
            raise serializers.ValidationError({error.field: [error.message]}) from error
        except EvaluationForbiddenError as error:
            raise exceptions.PermissionDenied(error.message) from error
        except EvaluationConflictError as error:
            raise Conflict(error.message, error.code) from error
        created = own_evaluations(_user(request)).get(pk=evaluation.pk)
        return Response(EvaluationSerializer(created).data, status=status.HTTP_201_CREATED)


class MyEvaluationListView(ProblemDetailsMixin, generics.ListAPIView[Evaluation]):
    """The signed-in student's own evaluations, latest first."""

    permission_classes = (IsAuthenticated,)
    serializer_class = EvaluationSerializer

    def get_queryset(self) -> QuerySet[Evaluation]:
        return own_evaluations(_user(self.request))


class MonitorRatingView(ProblemDetailsMixin, APIView):
    """RF-063: a monitor's average, or "sin datos suficientes" below the minimum (RN-007.5)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(responses={200: MonitorRatingSerializer, 404: PROBLEM})
    def get(self, request: Request, pk: UUID) -> Response:
        monitor = rated_monitor(pk)
        if monitor is None:
            raise exceptions.NotFound
        rating = monitor_rating(monitor)
        data = {
            "monitor": monitor,
            "published": rating.published,
            "average": rating.average,
            # The count is a figure too: hidden until the average can be published.
            "evaluation_count": rating.count if rating.published else None,
            "minimum_evaluations": rating.minimum,
        }
        return Response(MonitorRatingSerializer(data).data)


class PendingEvaluationListView(ProblemDetailsMixin, generics.ListAPIView[Reservation]):
    """T-06.10: the signed-in student's attended sessions still to evaluate, latest first."""

    permission_classes = (IsAuthenticated,)
    serializer_class = HistoryItemSerializer

    def get_queryset(self) -> QuerySet[Reservation]:
        return pending_evaluations(_user(self.request).pk)
