/**
 * Reservation endpoints (FASE-04): a student books a seat in a slot and cancels it; students
 * and monitors list the reservations that involve them. The API takes the student from the
 * session, never from the request body.
 *
 * Errors follow SAD §6.3 (`type`, `title`, `status`, `detail`…); `detail` is always a message
 * fit for the interface. A 409 means the state changed under the user: the slot filled up,
 * or the reservation was already cancelled.
 *
 * Cancellation policy (ADR-011): up to 4 hours before the start a student's cancellation is a
 * plain cancellation; later it is recorded as a no-show, and the seat is freed either way.
 * The monitor cancels with a mandatory reason.
 */

import { ApiError, apiRequest, queryString } from "@/lib/api-client";
import type { components } from "@/types/api";

type Schemas = components["schemas"];

export type Reservation = Schemas["Reservation"];
export type ReservationPage = Schemas["PaginatedReservationList"];
export type ReservationStatus = Schemas["ReservationStatusEnum"];

/** ADR-011: the student's cancellation window, in hours before the start. */
export const CANCEL_WINDOW_HOURS = 4;

/** Longest justification the API accepts. */
export const MAX_REASON_LENGTH = 500;

/** Longest note a student may leave for the monitor when booking (RF-047). */
export const MAX_NOTE_LENGTH = 500;

/** Which side of a reservation the user is on: who booked it, or whose slot it is. */
export type ReservationRole = "student" | "monitor";

export type ReservationFilters = {
  /** "student": booked by the user; "monitor": on the user's slots. null: both sides. */
  role: ReservationRole | null;
  /** "upcoming": not started yet, soonest first; "past": already started. null: all. */
  when: "upcoming" | "past" | null;
  /** null lists every state. */
  status: ReservationStatus | null;
};

export const NO_RESERVATION_FILTERS: ReservationFilters = { role: null, when: null, status: null };

/**
 * Books a seat. The optional note for the monitor (RF-047) travels trimmed, and is left out
 * when blank; it cannot be edited afterwards.
 */
export function reserveSlot(slotId: number, note = ""): Promise<Reservation> {
  const trimmed = note.trim();
  return apiRequest<Reservation>("/reservations/", {
    method: "POST",
    body: trimmed ? { slot_id: slotId, note: trimmed } : { slot_id: slotId },
  });
}

export function listMyReservations(
  page: number,
  filters: ReservationFilters,
  signal?: AbortSignal,
): Promise<ReservationPage> {
  return apiRequest<ReservationPage>(
    `/reservations/mine/${queryString({
      page,
      role: filters.role,
      when: filters.when,
      status: filters.status,
    })}`,
    { signal },
  );
}

/** The reason is required when the monitor or an administrator cancels (ADR-011). */
export function cancelReservation(id: string, reason?: string): Promise<Reservation> {
  return apiRequest<Reservation>(`/reservations/${id}/cancel/`, {
    method: "POST",
    body: reason === undefined ? {} : { reason },
  });
}

/** The `type` of an SAD §6.3 error, e.g. "slot_unavailable" or "already_reserved". */
export function problemType(error: unknown): string | null {
  if (!(error instanceof ApiError) || typeof error.body !== "object" || error.body === null) {
    return null;
  }
  const { type } = error.body as { type?: unknown };
  return typeof type === "string" ? type : null;
}

/** The slot changed under the user: it filled up, or the reservation already ended. */
export function isReservationConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}

const HOUR_MS = 3_600_000;

/** The session already began: nobody can cancel it any more. */
export function hasStarted(startsAt: string, now: Date = new Date()): boolean {
  return new Date(startsAt).getTime() <= now.getTime();
}

/** A student cancelling now would be recorded as a no-show (ADR-011). */
export function cancelsAsNoShow(startsAt: string, now: Date = new Date()): boolean {
  return new Date(startsAt).getTime() - now.getTime() < CANCEL_WINDOW_HOURS * HOUR_MS;
}
