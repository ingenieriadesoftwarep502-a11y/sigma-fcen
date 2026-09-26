"""Public health endpoint used by developers, CI and future uptime monitors."""

from django.db import DatabaseError, connection
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

_HealthSerializer = inline_serializer(
    name="Health",
    fields={"status": serializers.CharField(), "database": serializers.CharField()},
)


def _database_is_reachable() -> bool:
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except DatabaseError:
        return False
    return True


class HealthView(APIView):
    """Reports service liveness and database connectivity. No authentication required."""

    permission_classes = (AllowAny,)
    authentication_classes = ()
    throttle_classes = ()

    @extend_schema(responses={200: _HealthSerializer, 503: _HealthSerializer})
    def get(self, request: Request) -> Response:
        if _database_is_reachable():
            return Response({"status": "ok", "database": "ok"})
        return Response(
            {"status": "degraded", "database": "unavailable"},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
