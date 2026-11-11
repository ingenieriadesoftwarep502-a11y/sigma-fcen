"""Pure composition of the reservation emails: subject, plain text and HTML.

Nothing here touches the database or the mail backend, so every message is testable as data.
Each recipient gets their own message; one address never appears in the other's email.
"""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from html import escape

from apps.availability.domain.rules import LOCAL_TZ

WEEKDAYS = ("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")
MONTHS = (
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
)
FOOTER = "Este es un mensaje automático de SIGMA-FCEN; no respondas a este correo."


class Canceller(StrEnum):
    """Who ended the reservation (RN-005.4)."""

    STUDENT = "STUDENT"
    MONITOR = "MONITOR"
    ADMIN = "ADMIN"


@dataclass(frozen=True)
class Person:
    name: str
    email: str


@dataclass(frozen=True)
class ReservationDetails:
    """A snapshot of the reservation taken inside the transaction that changed it."""

    subject: str
    starts_at: datetime
    ends_at: datetime
    modality: str
    location: str
    student: Person
    monitor: Person
    note: str = ""


@dataclass(frozen=True)
class Cancellation:
    by: Canceller
    # ADR-011: a student cancelling inside the window is recorded as a no-show.
    late: bool
    reason: str


@dataclass(frozen=True)
class Email:
    """One message for one recipient; `kind` names it in logs without exposing the address."""

    kind: str
    to: str
    subject: str
    text: str
    html: str


def format_when(starts_at: datetime, ends_at: datetime) -> str:
    """'martes 17 de noviembre de 2026, de 10:00 a 11:00 (hora de Colombia)'."""
    start = starts_at.astimezone(LOCAL_TZ)
    end = ends_at.astimezone(LOCAL_TZ)
    day = f"{WEEKDAYS[start.weekday()]} {start.day} de {MONTHS[start.month - 1]} de {start.year}"
    return f"{day}, de {start:%H:%M} a {end:%H:%M} (hora de Colombia)"


def _short_when(starts_at: datetime) -> str:
    start = starts_at.astimezone(LOCAL_TZ)
    return f"{start.day} de {MONTHS[start.month - 1]}, {start:%H:%M}"


def _one_line(value: str) -> str:
    """Header values never carry line breaks (no header injection)."""
    return " ".join(value.split())


def _subject(prefix: str, details: ReservationDetails) -> str:
    return _one_line(f"{prefix}: {details.subject} · {_short_when(details.starts_at)}")


def _fields(details: ReservationDetails) -> list[tuple[str, str]]:
    return [
        ("Asignatura", details.subject),
        ("Fecha", format_when(details.starts_at, details.ends_at)),
        ("Monitor", details.monitor.name),
        ("Estudiante", details.student.name),
        ("Modalidad", details.modality),
        ("Lugar o enlace", details.location),
    ]


def _compose(
    *,
    kind: str,
    to: Person,
    subject: str,
    intro: str,
    fields: list[tuple[str, str]],
    closing: str = "",
) -> Email:
    shown = [(label, value) for label, value in fields if value]
    greeting = f"Hola, {to.name}:"
    text_lines = [greeting, "", intro, ""]
    text_lines += [f"{label}: {value}" for label, value in shown]
    if closing:
        text_lines += ["", closing]
    text_lines += ["", FOOTER]

    rows = "".join(
        f"<tr><th align='left' style='padding:4px 12px 4px 0'>{escape(label)}</th>"
        f"<td style='padding:4px 0'>{escape(value)}</td></tr>"
        for label, value in shown
    )
    html_parts = [
        f"<p>{escape(greeting)}</p>",
        f"<p>{escape(intro)}</p>",
        f"<table role='presentation'>{rows}</table>",
    ]
    if closing:
        html_parts.append(f"<p>{escape(closing)}</p>")
    html_parts.append(f"<p style='color:#666;font-size:12px'>{escape(FOOTER)}</p>")
    html = (
        "<!doctype html><html lang='es'><body style='font-family:sans-serif'>"
        + "".join(html_parts)
        + "</body></html>"
    )
    return Email(kind=kind, to=to.email, subject=subject, text="\n".join(text_lines), html=html)


def booking_emails(details: ReservationDetails) -> tuple[Email, Email]:
    """The student's confirmation and the monitor's notice of a new reservation."""
    student = _compose(
        kind="booking.student",
        to=details.student,
        subject=_subject("Reserva confirmada", details),
        intro="Tu reserva de monitoría quedó confirmada.",
        fields=_fields(details),
        closing="Si no puedes asistir, cancela la reserva con anticipación desde SIGMA-FCEN.",
    )
    monitor = _compose(
        kind="booking.monitor",
        to=details.monitor,
        subject=_subject("Nueva reserva", details),
        intro=f"{details.student.name} reservó una de tus franjas de monitoría.",
        # RF-047: the student's note is addressed to the monitor only.
        fields=[*_fields(details), ("Nota del estudiante", details.note)],
    )
    return student, monitor


def _cancellation_intros(
    details: ReservationDetails, cancellation: Cancellation
) -> tuple[str, str]:
    student_name, monitor_name = details.student.name, details.monitor.name
    if cancellation.by == Canceller.STUDENT and cancellation.late:
        return (
            "Cancelaste tu reserva fuera del plazo de cancelación, por lo que quedó "
            "registrada como inasistencia.",
            f"{student_name} canceló su reserva fuera del plazo de cancelación; quedó "
            "registrada como inasistencia y el cupo quedó libre.",
        )
    if cancellation.by == Canceller.STUDENT:
        return (
            "Cancelaste tu reserva de monitoría.",
            f"{student_name} canceló su reserva de monitoría; el cupo quedó libre.",
        )
    if cancellation.by == Canceller.MONITOR:
        return (
            f"{monitor_name} canceló tu reserva de monitoría.",
            f"Cancelaste la reserva de {student_name}.",
        )
    return (
        "Un administrador canceló tu reserva de monitoría.",
        f"Un administrador canceló la reserva de {student_name}.",
    )


def cancellation_emails(
    details: ReservationDetails, cancellation: Cancellation
) -> tuple[Email, Email]:
    """The student's and the monitor's notice that a reservation ended before the session."""
    student_intro, monitor_intro = _cancellation_intros(details, cancellation)
    fields = [*_fields(details), ("Motivo", cancellation.reason)]
    subject = _subject("Reserva cancelada", details)
    student = _compose(
        kind="cancellation.student",
        to=details.student,
        subject=subject,
        intro=student_intro,
        fields=fields,
    )
    monitor = _compose(
        kind="cancellation.monitor",
        to=details.monitor,
        subject=subject,
        intro=monitor_intro,
        fields=fields,
    )
    return student, monitor
