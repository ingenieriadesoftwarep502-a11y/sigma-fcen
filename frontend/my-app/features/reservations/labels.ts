/** How the reservation screens name states and outcomes, in Spanish. */

import type { ReservationStatus } from "@/lib/reservations";

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  CONFIRMED: "Confirmada",
  CANCELLED: "Cancelada",
  COMPLETED: "Completada",
  // ADR-011: a late cancellation by the student is recorded as a no-show.
  NO_SHOW: "Inasistencia",
};

export const REASON_REQUIRED_MESSAGE = "Escribe la justificación de la cancelación.";
