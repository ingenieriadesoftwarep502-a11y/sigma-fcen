"""Test-only URLconf: the project routes plus a probe view that uses DRF defaults."""

from django.urls import include, path
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView


class DefaultPermissionProbeView(APIView):
    """Declares no permission classes, so it inherits REST_FRAMEWORK defaults."""

    def get(self, request: Request) -> Response:
        return Response({"ok": True})


urlpatterns = [
    path("", include("mi_proyecto.urls")),
    path("test-only/protected/", DefaultPermissionProbeView.as_view()),
]
