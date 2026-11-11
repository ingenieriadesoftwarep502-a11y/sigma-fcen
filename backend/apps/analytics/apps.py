"""Analytics bounded context (DDD section 3): what the data says, read-only.

FASE-08 adds the teacher's follow-up of their own courses; FASE-09 adds the faculty metrics.
It owns no tables: every figure is a database aggregate over the other contexts.
"""

from django.apps import AppConfig


class AnalyticsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.analytics"
