"""Tutoring sessions bounded context (DDD section 4.5): what happened in a slot."""

from django.apps import AppConfig


class TutoringSessionsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.tutoring_sessions"
