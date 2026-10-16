"""HTTP endpoints of the availability context (FASE-03 section 4.2)."""

from collections.abc import Callable
from typing import Any, TypeVar, cast

from django.db.models import QuerySet
from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import exceptions, generics, serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.selectors import current_term
from apps.accounts.models import User
from apps.availability.domain.rules import SlotRuleError
from apps.availability.models import AvailabilitySlot, SlotTemplate
from apps.availability.selectors import (
    monitor_slots,
    monitor_templates,
    search_slots,
    slots_with_details,
    templates_with_details,
)
from apps.availability.serializers import (
    AvailabilitySlotSerializer,
    MineFilterSerializer,
    SearchFilterSerializer,
    SlotCreateSerializer,
    SlotTemplateCreateSerializer,
    SlotTemplateSerializer,
    SlotUpdateSerializer,
    TermFilterSerializer,
)
from apps.availability.services import (
    SlotConflictError,
    SlotForbiddenError,
    TemplateConflictError,
    cancel_slot,
    create_slot,
    create_template,
    deactivate_template,
    update_slot,
)
from shared.permissions import IsMonitor

T = TypeVar("T")

CONFLICT_RESPONSE = OpenApiResponse(
    description="La franja tiene una reserva o ya no está disponible."
)


class Conflict(exceptions.APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "conflict"


def _monitor(request: Request) -> User:
    return cast(User, request.user)


def _query(request: Request, serializer_class: type[serializers.Serializer[Any]]) -> dict[str, Any]:
    """Validates the query string; invalid values become a 400 response."""
    params = serializer_class(data=request.query_params)
    params.is_valid(raise_exception=True)
    return dict(params.validated_data)


def _write(operation: Callable[[], T]) -> T:
    """Maps domain errors to HTTP: rules 400, authorization 403, state 409."""
    try:
        return operation()
    except TemplateConflictError as error:
        raise serializers.ValidationError(
            {
                error.field: [error.message],
                "conflicts": [day.isoformat() for day in error.dates],
            }
        ) from error
    except SlotRuleError as error:
        raise serializers.ValidationError({error.field: [error.message]}) from error
    except SlotForbiddenError as error:
        raise exceptions.PermissionDenied(error.message) from error
    except SlotConflictError as error:
        raise Conflict(error.message) from error


# --- Slots ---------------------------------------------------------------------------------


class SlotCreateView(APIView):
    """A monitor publishes a single slot on an assigned subject (CA-HU05-1, CA-HU05-5)."""

    permission_classes = (IsMonitor,)

    @extend_schema(request=SlotCreateSerializer, responses={201: AvailabilitySlotSerializer})
    def post(self, request: Request) -> Response:
        serializer = SlotCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        slot = _write(lambda: create_slot(monitor=_monitor(request), **serializer.validated_data))
        created = slots_with_details().get(pk=slot.pk)
        return Response(AvailabilitySlotSerializer(created).data, status=status.HTTP_201_CREATED)


@extend_schema_view(get=extend_schema(parameters=[MineFilterSerializer]))
class MonitorSlotListView(generics.ListAPIView[AvailabilitySlot]):
    """The requesting monitor's own slots, every state, of one term (the current by default)."""

    permission_classes = (IsMonitor,)
    serializer_class = AvailabilitySlotSerializer

    def get_queryset(self) -> QuerySet[AvailabilitySlot]:
        params = _query(self.request, MineFilterSerializer)
        term = params.pop("term", None) or current_term()
        return monitor_slots(_monitor(self.request), term=term, **params)


class SlotDetailView(APIView):
    """The owner moves, edits or withdraws a slot; another monitor's slot is a 404."""

    permission_classes = (IsMonitor,)

    def _own_slot(self, request: Request, pk: int) -> AvailabilitySlot:
        slot = slots_with_details().filter(monitor=_monitor(request), pk=pk).first()
        if slot is None:
            raise exceptions.NotFound
        return slot

    @extend_schema(
        request=SlotUpdateSerializer,
        responses={200: AvailabilitySlotSerializer, 409: CONFLICT_RESPONSE},
    )
    def patch(self, request: Request, pk: int) -> Response:
        slot = self._own_slot(request, pk)
        serializer = SlotUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        _write(lambda: update_slot(slot, dict(serializer.validated_data)))
        return Response(AvailabilitySlotSerializer(self._own_slot(request, pk)).data)

    @extend_schema(responses={204: None, 409: CONFLICT_RESPONSE})
    def delete(self, request: Request, pk: int) -> Response:
        slot = self._own_slot(request, pk)
        _write(lambda: cancel_slot(slot))
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema_view(get=extend_schema(parameters=[SearchFilterSerializer]))
class SlotSearchView(generics.ListAPIView[AvailabilitySlot]):
    """Bookable slots for any authenticated user, with combinable filters (HU-02)."""

    permission_classes = (IsAuthenticated,)
    serializer_class = AvailabilitySlotSerializer

    def get_queryset(self) -> QuerySet[AvailabilitySlot]:
        return search_slots(**_query(self.request, SearchFilterSerializer))


# --- Weekly templates --------------------------------------------------------------------------


class SlotTemplateCreateView(APIView):
    """A monitor creates a weekly template; its slots are generated all or nothing (ADR-010)."""

    permission_classes = (IsMonitor,)

    @extend_schema(request=SlotTemplateCreateSerializer, responses={201: SlotTemplateSerializer})
    def post(self, request: Request) -> Response:
        serializer = SlotTemplateCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        template = _write(
            lambda: create_template(monitor=_monitor(request), **serializer.validated_data)
        )
        created = templates_with_details().get(pk=template.pk)
        return Response(SlotTemplateSerializer(created).data, status=status.HTTP_201_CREATED)


@extend_schema_view(get=extend_schema(parameters=[TermFilterSerializer]))
class MonitorTemplateListView(generics.ListAPIView[SlotTemplate]):
    """The requesting monitor's templates of one term (the current one by default)."""

    permission_classes = (IsMonitor,)
    serializer_class = SlotTemplateSerializer

    def get_queryset(self) -> QuerySet[SlotTemplate]:
        term = _query(self.request, TermFilterSerializer).get("term") or current_term()
        return monitor_templates(_monitor(self.request), term)


class SlotTemplateDetailView(APIView):
    """The owner deactivates a template and withdraws its future unreserved slots."""

    permission_classes = (IsMonitor,)

    @extend_schema(responses={204: None})
    def delete(self, request: Request, pk: int) -> Response:
        template = SlotTemplate.objects.filter(monitor=_monitor(request), pk=pk).first()
        if template is None:
            raise exceptions.NotFound
        deactivate_template(template)
        return Response(status=status.HTTP_204_NO_CONTENT)
