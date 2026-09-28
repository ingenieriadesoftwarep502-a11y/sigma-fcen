"""Routes mounted under /api/v1/auth/."""

from django.urls import path

from apps.accounts.views import RegisterView

auth_patterns = [
    path("register/", RegisterView.as_view(), name="register"),
]
