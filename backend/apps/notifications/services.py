"""Reservation emails: snapshot inside the transaction, deliver after it commits.

The use cases call `notify_reservation_booked` and `notify_reservation_cancelled` from inside
their `transaction.atomic()` block. The message is composed there, from the rows the use case
already holds, and handed to `transaction.on_commit`: a rolled-back change sends nothing and
no SMTP call ever runs while a row is locked (FASE-04 §11).

Delivery is best effort. A failed send is logged with its traceback and swallowed, so it can
never undo or fail the booking or cancellation that triggered it.
"""

import logging
from collections.abc import Iterable
from functools import partial

from django.core.mail import EmailMultiAlternatives
from django.db import transaction

from apps.accounts.models import User
from apps.availability.models import AvailabilitySlot
from apps.notifications.domain.messages import (
    Cancellation,
    Canceller,
    Email,
    Person,
    ReservationDetails,
    booking_emails,
    cancellation_emails,
)
from apps.reservations.domain.rules import ReservationStatus
from apps.reservations.models import Reservation

logger = logging.getLogger(__name__)


def _person(user: User) -> Person:
    name = f"{user.first_name} {user.last_name}".strip()
    return Person(name=name or user.email, email=user.email)


def _details(reservation: Reservation, slot: AvailabilitySlot) -> ReservationDetails:
    return ReservationDetails(
        subject=slot.subject.name,
        starts_at=slot.starts_at,
        ends_at=slot.ends_at,
        modality=slot.get_modality_display(),
        location=slot.location,
        student=_person(reservation.student),
        monitor=_person(slot.monitor),
        note=reservation.student_note,
    )


def _canceller(reservation: Reservation, slot: AvailabilitySlot) -> Canceller:
    """Mirrors the authorization order of the cancellation use case (RN-005.4)."""
    if reservation.cancelled_by_id == reservation.student_id:
        return Canceller.STUDENT
    if reservation.cancelled_by_id == slot.monitor_id:
        return Canceller.MONITOR
    return Canceller.ADMIN


def send_emails(emails: Iterable[Email], *, reference: str) -> None:
    """Sends each message on its own; one failure never stops the others nor propagates."""
    for email in emails:
        message = EmailMultiAlternatives(subject=email.subject, body=email.text, to=[email.to])
        message.attach_alternative(email.html, "text/html")
        try:
            message.send()
        except Exception:
            # Best effort by design (see the module docstring); the address stays out of logs.
            logger.exception(
                "Email %s for reservation %s could not be sent.", email.kind, reference
            )


def _deliver_on_commit(emails: tuple[Email, ...], reservation: Reservation) -> None:
    transaction.on_commit(partial(send_emails, emails, reference=str(reservation.pk)))


def notify_reservation_booked(reservation: Reservation, *, slot: AvailabilitySlot) -> None:
    """Student confirmation and monitor notice, once the booking commits."""
    _deliver_on_commit(booking_emails(_details(reservation, slot)), reservation)


def notify_reservation_cancelled(reservation: Reservation, *, slot: AvailabilitySlot) -> None:
    """Both parties learn that the reservation ended (CANCELLED, or NO_SHOW per ADR-011)."""
    cancellation = Cancellation(
        by=_canceller(reservation, slot),
        late=reservation.status == ReservationStatus.NO_SHOW,
        reason=reservation.cancellation_reason,
    )
    emails = cancellation_emails(_details(reservation, slot), cancellation)
    _deliver_on_commit(emails, reservation)
