"""Test-only URLconf: one probe endpoint guarded by each role permission (T-01.10)."""

from django.urls import path
from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from shared.permissions import IsAdmin, IsMonitor, IsStudent, IsTeacher


def _probe(permission: type[BasePermission]) -> type[APIView]:
    class RoleProbeView(APIView):
        permission_classes = (permission,)

        def get(self, request: Request) -> Response:
            return Response({"ok": True})

    return RoleProbeView


urlpatterns = [
    path("test-only/student/", _probe(IsStudent).as_view()),
    path("test-only/monitor/", _probe(IsMonitor).as_view()),
    path("test-only/teacher/", _probe(IsTeacher).as_view()),
    path("test-only/admin/", _probe(IsAdmin).as_view()),
]
