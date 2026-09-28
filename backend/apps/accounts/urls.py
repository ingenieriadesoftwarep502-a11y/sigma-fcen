"""Routes mounted under /api/v1/auth/ and /api/v1/users/."""

from django.urls import path

from apps.accounts.views import (
    LoginView,
    LogoutView,
    MeView,
    RefreshView,
    RegisterView,
    UserDetailView,
    UserListCreateView,
)

auth_patterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", LoginView.as_view(), name="login"),
    path("refresh/", RefreshView.as_view(), name="token-refresh"),
    path("logout/", LogoutView.as_view(), name="logout"),
]

users_patterns = [
    path("", UserListCreateView.as_view(), name="user-list"),
    path("me/", MeView.as_view(), name="me"),
    path("<uuid:pk>/", UserDetailView.as_view(), name="user-detail"),
]
