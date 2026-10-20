"""Builders for reservation test data (FASE-04). Not collected by pytest."""

from typing import Any

from apps.accounts.models import Role, User
from apps.availability.models import AvailabilitySlot
from apps.reservations.models import Reservation
from tests.catalog_data import make_user


def make_student(email: str = "ana.perez@unal.edu.co", **extra: Any) -> User:
    return make_user(email, Role.Code.STUDENT, **extra)


def make_reservation(slot: AvailabilitySlot, student: User, **extra: Any) -> Reservation:
    """Inserts the row directly, bypassing the service: for state set-up only."""
    return Reservation.objects.create(slot=slot, student=student, **extra)
