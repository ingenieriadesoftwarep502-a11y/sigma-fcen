"""Pure composition of the reservation emails (booking and cancellation notifications)."""

from dataclasses import replace
from datetime import UTC, datetime

import pytest

from apps.notifications.domain.messages import (
    Cancellation,
    Canceller,
    Email,
    Person,
    ReservationDetails,
    booking_emails,
    cancellation_emails,
    format_when,
)

STUDENT = Person(name="Ana Pérez", email="ana.perez@unal.edu.co")
MONITOR = Person(name="Luis Gómez", email="luis.gomez@unal.edu.co")
# 15:00 UTC is 10:00 in Bogotá (UTC-5); Tuesday 17 November 2026.
STARTS_AT = datetime(2026, 11, 17, 15, 0, tzinfo=UTC)
ENDS_AT = datetime(2026, 11, 17, 16, 0, tzinfo=UTC)

DETAILS = ReservationDetails(
    subject="Cálculo Diferencial",
    starts_at=STARTS_AT,
    ends_at=ENDS_AT,
    modality="Presencial",
    location="Edificio 404, aula 201",
    student=STUDENT,
    monitor=MONITOR,
    note="Quiero repasar límites.",
)


def _all_text(email: Email) -> str:
    return "\n".join((email.subject, email.text, email.html))


# --- Date and time ---------------------------------------------------------------------------


def test_format_when_uses_bogota_local_time_in_spanish() -> None:
    assert format_when(STARTS_AT, ENDS_AT) == (
        "martes 17 de noviembre de 2026, de 10:00 a 11:00 (hora de Colombia)"
    )


# --- Booking ---------------------------------------------------------------------------------


def test_booking_sends_one_message_per_recipient() -> None:
    student_email, monitor_email = booking_emails(DETAILS)

    assert student_email.to == STUDENT.email
    assert monitor_email.to == MONITOR.email


def test_booking_never_exposes_one_address_to_the_other_recipient() -> None:
    student_email, monitor_email = booking_emails(DETAILS)

    assert MONITOR.email not in _all_text(student_email)
    assert STUDENT.email not in _all_text(monitor_email)


def test_booking_confirmation_for_the_student_carries_the_details() -> None:
    student_email, _ = booking_emails(DETAILS)

    assert student_email.subject.startswith("Reserva confirmada: Cálculo Diferencial")
    for expected in (
        "Ana Pérez",
        "Luis Gómez",
        "Cálculo Diferencial",
        "martes 17 de noviembre de 2026, de 10:00 a 11:00",
        "Presencial",
        "Edificio 404, aula 201",
    ):
        assert expected in student_email.text
        assert expected in student_email.html


def test_booking_notice_for_the_monitor_names_the_student_and_the_note() -> None:
    student_email, monitor_email = booking_emails(DETAILS)

    assert monitor_email.subject.startswith("Nueva reserva: Cálculo Diferencial")
    assert "Ana Pérez" in monitor_email.text
    assert "10:00 a 11:00" in monitor_email.text
    # RF-047: the note is for the monitor only.
    assert "Quiero repasar límites." in monitor_email.text
    assert "Quiero repasar límites." not in student_email.text


def test_booking_without_note_omits_the_note_line() -> None:
    _, monitor_email = booking_emails(replace(DETAILS, note=""))

    assert "Nota del estudiante" not in monitor_email.text


def test_html_alternative_escapes_user_content() -> None:
    student_email, _ = booking_emails(replace(DETAILS, location="<script>x</script>"))

    assert "<script>" not in student_email.html
    assert "&lt;script&gt;" in student_email.html


def test_subject_line_never_carries_line_breaks() -> None:
    student_email, monitor_email = booking_emails(replace(DETAILS, subject="Física\r\nBcc: x"))

    for email in (student_email, monitor_email):
        assert "\n" not in email.subject
        assert "\r" not in email.subject


# --- Cancellation ----------------------------------------------------------------------------


def test_student_cancellation_in_time_notifies_both() -> None:
    cancellation = Cancellation(by=Canceller.STUDENT, late=False, reason="")

    student_email, monitor_email = cancellation_emails(DETAILS, cancellation)

    assert (student_email.to, monitor_email.to) == (STUDENT.email, MONITOR.email)
    assert student_email.subject.startswith("Reserva cancelada: Cálculo Diferencial")
    assert "Cancelaste tu reserva" in student_email.text
    assert "Ana Pérez canceló su reserva" in monitor_email.text
    assert "inasistencia" not in student_email.text
    assert "Motivo" not in student_email.text


def test_late_student_cancellation_is_reported_as_a_no_show() -> None:
    cancellation = Cancellation(by=Canceller.STUDENT, late=True, reason="")

    student_email, monitor_email = cancellation_emails(DETAILS, cancellation)

    assert "inasistencia" in student_email.text
    assert "inasistencia" in monitor_email.text


def test_monitor_cancellation_carries_the_reason_to_both() -> None:
    cancellation = Cancellation(by=Canceller.MONITOR, late=False, reason="Estoy enfermo.")

    student_email, monitor_email = cancellation_emails(DETAILS, cancellation)

    assert "Luis Gómez canceló tu reserva" in student_email.text
    assert "Cancelaste la reserva de Ana Pérez" in monitor_email.text
    for email in (student_email, monitor_email):
        assert "Motivo: Estoy enfermo." in email.text
        assert "Estoy enfermo." in email.html


def test_admin_cancellation_is_attributed_to_an_administrator() -> None:
    cancellation = Cancellation(by=Canceller.ADMIN, late=False, reason="Cierre del edificio.")

    student_email, monitor_email = cancellation_emails(DETAILS, cancellation)

    assert "Un administrador canceló tu reserva" in student_email.text
    assert "Un administrador canceló la reserva de Ana Pérez" in monitor_email.text
    assert "Motivo: Cierre del edificio." in monitor_email.text


@pytest.mark.parametrize("by", list(Canceller))
def test_cancellation_never_exposes_one_address_to_the_other(by: Canceller) -> None:
    student_email, monitor_email = cancellation_emails(
        DETAILS, Cancellation(by=by, late=False, reason="Motivo")
    )

    assert MONITOR.email not in _all_text(student_email)
    assert STUDENT.email not in _all_text(monitor_email)
