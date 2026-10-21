"""Academic catalog bounded context (DDD section 3): what is taught and who attends it."""

from django.apps import AppConfig


class AcademicsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.academics"
