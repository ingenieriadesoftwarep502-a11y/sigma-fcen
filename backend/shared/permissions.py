"""Reusable DRF permissions by business role (RN-002.1, RNF-SEC-004).

Roles are checked on the server for every request; the frontend only hides what these deny.
Django's is_superuser/is_staff flags grant admin-site access, never business roles (ADR-008).
"""

from typing import ClassVar

from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView

from apps.accounts.models import Role


class HasRole(BasePermission):
    role: ClassVar[Role.Code]

    def has_permission(self, request: Request, view: APIView) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.has_role(self.role))


class IsStudent(HasRole):
    role = Role.Code.STUDENT


class IsMonitor(HasRole):
    role = Role.Code.MONITOR


class IsTeacher(HasRole):
    role = Role.Code.TEACHER


class IsAdmin(HasRole):
    role = Role.Code.ADMIN


class IsAdminOrReadOnly(BasePermission):
    """Any authenticated user reads; only administrators write (catalog, T-02.6)."""

    def has_permission(self, request: Request, view: APIView) -> bool:
        user = request.user
        if not (user and user.is_authenticated):
            return False
        return request.method in SAFE_METHODS or user.has_role(Role.Code.ADMIN)
