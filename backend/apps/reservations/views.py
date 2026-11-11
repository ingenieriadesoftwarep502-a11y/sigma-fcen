"""HTTP endpoints of the reservations context (FASE-04 §5).

Every error answers in the SAD §6.3 format: rules 400, authorization 403, state 409.
"""

from collections.abc import Callable
from typing import TypeVar, cast
from uuid import UUID

from django.db.models import QuerySet
from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import exceptions, generics, serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.reservations.domain.rules import (
    SLOT_FIELD,
    ReservationConflictError,
    ReservationForbiddenError,
    ReservationRuleError,
)
from apps.reservations.models import Reservation
from apps.reservations.selectors import can_read, reservations_with_details, user_reservations
from apps.reservations.serializers import (
    MineFilterSerializer,
    ReservationCancelSerializer,
    ReservationCreateSerializer,
    ReservationSerializer,
)
from apps.reservations.services import cancel_reservation, reserve_slot
from shared.permissions import IsStudent
from shared.problems import Conflict, ProblemDetailsMixin

T = TypeVar("T")

NOT_PARTICIPANT_MESSAGE = "Esta reserva no es tuya."

PROBLEM = OpenApiResponse(description="Error en el formato de SAD §6.3 (type, title, detail…).")

# Conflicts about the slot point at the input that named it (SAD §6.3 example).
SLOT_CONFLICTS = frozenset({"slot_unavailable", "slot_full", "already_reserved"})


def _user(request: Request) -> User:
    return cast(User, request.user)


def _write(operation: Callable[[], T]) -> T:
    """Maps domain errors to HTTP: rules 400, authorization 403, state 409."""
    try:
        return operation()
    except ReservationRuleError as error:
        raise serializers.ValidationError({error.field: [error.message]}) from error
    except ReservationForbiddenError as error:
        raise exceptions.PermissionDenied(error.message) from error
    except ReservationConflictError as error:
        errors = {SLOT_FIELD: [error.message]} if error.code in SLOT_CONFLICTS else None
        raise Conflict(error.message, error.code, errors) from error


def _readable(request: Request, pk: UUID) -> Reservation:
    reservation = reservations_with_details().filter(pk=pk).first()
    if reservation is None:
        raise exceptions.NotFound
    if not can_read(_user(request), reservation):
        raise exceptions.PermissionDenied(NOT_PARTICIPANT_MESSAGE)
    return reservation


class ReservationCreateView(ProblemDetailsMixin, APIView):
    """A student books a seat in a slot (HU-03, CA-HU03-1 to CA-HU03-6)."""

    permission_classes = (IsStudent,)

    @extend_schema(
        request=ReservationCreateSerializer,
        responses={201: ReservationSerializer, 400: PROBLEM, 403: PROBLEM, 409: PROBLEM},
    )
    def post(self, request: Request) -> Response:
        serializer = ReservationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        slot = serializer.validated_data["slot_id"]
        note = serializer.validated_data.get("note")
        reservation = _write(lambda: reserve_slot(student=_user(request), slot=slot, note=note))
        created = reservations_with_details().get(pk=reservation.pk)
        return Response(ReservationSerializer(created).data, status=status.HTTP_201_CREATED)


@extend_schema_view(get=extend_schema(parameters=[MineFilterSerializer]))
class MyReservationListView(ProblemDetailsMixin, generics.ListAPIView[Reservation]):
    """The student's own reservations and the monitor's reservations on their slots."""

    permission_classes = (IsAuthenticated,)
    serializer_class = ReservationSerializer

    def get_queryset(self) -> QuerySet[Reservation]:
        params = MineFilterSerializer(data=self.request.query_params)
        params.is_valid(raise_exception=True)
        return user_reservations(_user(self.request), **params.validated_data)


class ReservationDetailView(ProblemDetailsMixin, APIView):
    """A reservation, for its participants and administrators."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(responses={200: ReservationSerializer, 403: PROBLEM, 404: PROBLEM})
    def get(self, request: Request, pk: UUID) -> Response:
        return Response(ReservationSerializer(_readable(request, pk)).data)


class ReservationCancelView(ProblemDetailsMixin, APIView):
    """The student, the slot's monitor or an administrator cancel (HU-04, ADR-011)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        request=ReservationCancelSerializer,
        responses={200: ReservationSerializer, 400: PROBLEM, 403: PROBLEM, 409: PROBLEM},
    )
    def post(self, request: Request, pk: UUID) -> Response:
        reservation = reservations_with_details().filter(pk=pk).first()
        if reservation is None:
            raise exceptions.NotFound
        serializer = ReservationCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        _write(
            lambda: cancel_reservation(
                reservation=reservation,
                actor=_user(request),
                reason=serializer.validated_data.get("reason"),
            )
        )
        return Response(ReservationSerializer(_readable(request, pk)).data)
