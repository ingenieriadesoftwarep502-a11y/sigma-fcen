"""Reusable DRF permissions by business role (RN-002.1, RNF-SEC-004).

Roles are checked on the server for every request; the frontend only hides what these deny.
Django's is_superuser/is_staff flags grant admin-site access, never business roles (ADR-008).
"""

from typing import ClassVar

from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView


class HasRole(BasePermission):
    role: ClassVar[str]

    def has_permission(self, request: Request, view: APIView) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.has_role(self.role))


class IsStudent(HasRole):
    role = "STUDENT"


class IsMonitor(HasRole):
    role = "MONITOR"


class IsTeacher(HasRole):
    role = "TEACHER"


class IsAdmin(HasRole):
    role = "ADMIN"
