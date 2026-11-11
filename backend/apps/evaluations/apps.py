"""Evaluations bounded context (DDD section 4.6): how students rate the service received."""

from django.apps import AppConfig


class EvaluationsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.evaluations"
