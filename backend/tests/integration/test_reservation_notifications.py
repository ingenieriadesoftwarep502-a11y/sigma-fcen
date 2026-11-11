"""Booking and cancellation emails, sent only after the transaction commits.

Every path that changes a reservation's state through a cancellation or a booking notifies
the student and the monitor separately. A failed send is logged and never undoes the change.
"""

import logging
from collections.abc import Callable
from datetime import timedelta
from smtplib import SMTPException
from typing import Any
from unittest import mock

import pytest
from django.core import mail
from django.core.mail import EmailMultiAlternatives
from django.test import override_settings
from django.utils import timezone

from apps.accounts.models import Role, User
from apps.availability.models import AvailabilitySlot
from apps.reservations.domain.rules import ReservationConflictError, ReservationStatus
from apps.reservations.models import Reservation
from apps.reservations.services import cancel_reservation, reserve_slot
from tests.availability_data import Owner, make_assigned_monitor, make_slot
from tests.catalog_data import make_user
from tests.reservation_data import make_student

pytestmark = pytest.mark.django_db

CaptureCallbacks = Callable[..., Any]
FROM_EMAIL = "SIGMA-FCEN <notificaciones@sigma.example.org>"


@pytest.fixture(autouse=True)
def _sender() -> Any:
    with override_settings(DEFAULT_FROM_EMAIL=FROM_EMAIL):
        yield


@pytest.fixture
def owner() -> Owner:
    monitor, subject, term = make_assigned_monitor()
    monitor.first_name, monitor.last_name = "Luis", "Gómez"
    monitor.save(update_fields=["first_name", "last_name"])
    return monitor, subject, term


@pytest.fixture
def student() -> User:
    return make_student(first_name="Ana", last_name="Pérez")


def _slot(owner: Owner, **extra: Any) -> AvailabilitySlot:
    return make_slot(*owner, **extra)


def _reserve(student: User, slot: AvailabilitySlot, capture: CaptureCallbacks) -> Reservation:
    with capture(execute=True):
        return reserve_slot(student=student, slot=slot)


def _by_recipient() -> dict[str, EmailMultiAlternatives]:
    sent: dict[str, EmailMultiAlternatives] = {}
    for message in mail.outbox:
        assert isinstance(message, EmailMultiAlternatives)
        assert len(message.to) == 1
        assert message.cc == []
        assert message.bcc == []
        sent[message.to[0]] = message
    return sent


def _html(message: EmailMultiAlternatives) -> str:
    [(content, mimetype)] = message.alternatives
    assert mimetype == "text/html"
    return str(content)


# --- Booking ---------------------------------------------------------------------------------


def test_booking_emails_the_student_and_the_monitor_separately(
    owner: Owner, student: User, django_capture_on_commit_callbacks: CaptureCallbacks
) -> None:
    slot = _slot(owner)

    _reserve(student, slot, django_capture_on_commit_callbacks)

    sent = _by_recipient()
    assert set(sent) == {student.email, owner[0].email}
    confirmation, notice = sent[student.email], sent[owner[0].email]
    assert confirmation.subject.startswith("Reserva confirmada:")
    assert notice.subject.startswith("Nueva reserva:")
    assert confirmation.from_email == FROM_EMAIL
    assert "Luis Gómez" in confirmation.body
    assert "Ana Pérez" in notice.body
    assert owner[1].name in _html(confirmation)


def test_booking_email_waits_for_the_commit(
    owner: Owner, student: User, django_capture_on_commit_callbacks: CaptureCallbacks
) -> None:
    with django_capture_on_commit_callbacks(execute=False) as callbacks:
        reserve_slot(student=student, slot=_slot(owner))

    assert mail.outbox == []
    assert len(callbacks) == 1


def test_rejected_booking_sends_nothing(
    owner: Owner, student: User, django_capture_on_commit_callbacks: CaptureCallbacks
) -> None:
    slot = _slot(owner)
    _reserve(student, slot, django_capture_on_commit_callbacks)
    mail.outbox.clear()

    with (
        pytest.raises(ReservationConflictError),
        django_capture_on_commit_callbacks(execute=True),
    ):
        reserve_slot(student=make_student("eva@unal.edu.co"), slot=slot)

    assert mail.outbox == []


# --- Cancellation ----------------------------------------------------------------------------


def test_student_cancellation_in_time_emails_both(
    owner: Owner, student: User, django_capture_on_commit_callbacks: CaptureCallbacks
) -> None:
    reservation = _reserve(student, _slot(owner), django_capture_on_commit_callbacks)
    mail.outbox.clear()

    with django_capture_on_commit_callbacks(execute=True):
        cancelled = cancel_reservation(reservation=reservation, actor=student)

    assert cancelled.status == ReservationStatus.CANCELLED
    sent = _by_recipient()
    assert set(sent) == {student.email, owner[0].email}
    assert "Cancelaste tu reserva" in sent[student.email].body
    assert "Ana Pérez canceló su reserva" in sent[owner[0].email].body


@override_settings(RESERVATION_MIN_ADVANCE_HOURS=0)
def test_late_student_cancellation_is_reported_as_a_no_show(
    owner: Owner, student: User, django_capture_on_commit_callbacks: CaptureCallbacks
) -> None:
    starts_at = (timezone.now() + timedelta(hours=1)).replace(second=0, microsecond=0)
    reservation = _reserve(
        student, _slot(owner, starts_at=starts_at), django_capture_on_commit_callbacks
    )
    mail.outbox.clear()

    with django_capture_on_commit_callbacks(execute=True):
        cancelled = cancel_reservation(reservation=reservation, actor=student)

    assert cancelled.status == ReservationStatus.NO_SHOW
    sent = _by_recipient()
    assert "inasistencia" in sent[student.email].body
    assert "inasistencia" in sent[owner[0].email].body


def test_monitor_cancellation_emails_both_with_the_reason(
    owner: Owner, student: User, django_capture_on_commit_callbacks: CaptureCallbacks
) -> None:
    reservation = _reserve(student, _slot(owner), django_capture_on_commit_callbacks)
    mail.outbox.clear()

    with django_capture_on_commit_callbacks(execute=True):
        cancel_reservation(reservation=reservation, actor=owner[0], reason="Estoy enfermo.")

    sent = _by_recipient()
    assert set(sent) == {student.email, owner[0].email}
    assert "Luis Gómez canceló tu reserva" in sent[student.email].body
    for message in sent.values():
        assert "Motivo: Estoy enfermo." in message.body


def test_admin_cancellation_emails_both(
    owner: Owner, student: User, django_capture_on_commit_callbacks: CaptureCallbacks
) -> None:
    admin = make_user("admin@unal.edu.co", Role.Code.ADMIN)
    reservation = _reserve(student, _slot(owner), django_capture_on_commit_callbacks)
    mail.outbox.clear()

    with django_capture_on_commit_callbacks(execute=True):
        cancel_reservation(reservation=reservation, actor=admin, reason="Cierre del edificio.")

    sent = _by_recipient()
    assert set(sent) == {student.email, owner[0].email}
    assert admin.email not in sent
    assert "Un administrador canceló tu reserva" in sent[student.email].body


def test_rejected_cancellation_sends_nothing(
    owner: Owner, student: User, django_capture_on_commit_callbacks: CaptureCallbacks
) -> None:
    reservation = _reserve(student, _slot(owner), django_capture_on_commit_callbacks)
    with django_capture_on_commit_callbacks(execute=True):
        cancel_reservation(reservation=reservation, actor=student)
    mail.outbox.clear()

    with (
        pytest.raises(ReservationConflictError),
        django_capture_on_commit_callbacks(execute=True),
    ):
        cancel_reservation(reservation=reservation, actor=student)

    assert mail.outbox == []


# --- Failure isolation -----------------------------------------------------------------------


def test_send_failure_is_logged_and_never_breaks_the_booking(
    owner: Owner,
    student: User,
    django_capture_on_commit_callbacks: CaptureCallbacks,
    caplog: pytest.LogCaptureFixture,
) -> None:
    broken = mock.patch(
        "django.core.mail.backends.locmem.EmailBackend.send_messages",
        side_effect=SMTPException("smtp down"),
    )

    with broken as send, caplog.at_level(logging.ERROR, logger="apps.notifications"):
        reservation = _reserve(student, _slot(owner), django_capture_on_commit_callbacks)

    assert Reservation.objects.get(pk=reservation.pk).status == ReservationStatus.CONFIRMED
    # One failure does not stop the other recipient's message.
    assert send.call_count == 2
    errors = [r for r in caplog.records if r.name.startswith("apps.notifications")]
    assert len(errors) == 2
    assert all(record.exc_info for record in errors)
    # Addresses stay out of the logs.
    assert student.email not in caplog.text
    assert owner[0].email not in caplog.text


def test_send_failure_never_breaks_the_cancellation(
    owner: Owner,
    student: User,
    django_capture_on_commit_callbacks: CaptureCallbacks,
    caplog: pytest.LogCaptureFixture,
) -> None:
    reservation = _reserve(student, _slot(owner), django_capture_on_commit_callbacks)
    broken = mock.patch(
        "django.core.mail.backends.locmem.EmailBackend.send_messages",
        side_effect=OSError("connection refused"),
    )

    with (
        broken,
        caplog.at_level(logging.ERROR, logger="apps.notifications"),
        django_capture_on_commit_callbacks(execute=True),
    ):
        cancel_reservation(reservation=reservation, actor=student)

    assert Reservation.objects.get(pk=reservation.pk).status == ReservationStatus.CANCELLED
    assert any(r.name.startswith("apps.notifications") for r in caplog.records)
