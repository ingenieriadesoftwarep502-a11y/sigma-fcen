"""Reservations bounded context (DDD section 3): a student holding a seat in a slot."""

from django.apps import AppConfig


class ReservationsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.reservations"
