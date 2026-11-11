"""Routes mounted under /api/v1/auth/ and /api/v1/users/."""

from django.urls import path

from apps.accounts.views import (
    CsrfView,
    LoginView,
    LogoutView,
    MeView,
    RefreshView,
    RegisterView,
    UserDeactivateView,
    UserDetailView,
    UserExportView,
    UserListCreateView,
    UserRolesView,
    UserSummaryView,
)

auth_patterns = [
    path("csrf/", CsrfView.as_view(), name="csrf"),
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", LoginView.as_view(), name="login"),
    path("refresh/", RefreshView.as_view(), name="token-refresh"),
    path("logout/", LogoutView.as_view(), name="logout"),
]

users_patterns = [
    path("", UserListCreateView.as_view(), name="user-list"),
    path("me/", MeView.as_view(), name="me"),
    # Literal segments stay before <uuid:pk>/ so they are never read as an id.
    path("summary/", UserSummaryView.as_view(), name="user-summary"),
    path("export/", UserExportView.as_view(), name="user-export"),
    path("<uuid:pk>/", UserDetailView.as_view(), name="user-detail"),
    path("<uuid:pk>/roles/", UserRolesView.as_view(), name="user-roles"),
    path("<uuid:pk>/deactivate/", UserDeactivateView.as_view(), name="user-deactivate"),
]
