import type { Reservation } from "@/lib/reservations";
import type { HistoryItem, PendingSlot, SessionSlot, Topic, TutoringSession } from "@/lib/sessions";

import { CALCULO_REF } from "../availability/fixtures";

const HOUR = 3_600_000;

export const MONITOR = { id: "m-1", full_name: "Sofía Díaz" };
export const ANA = { id: "s-1", full_name: "Ana Pérez" };
export const LUIS = { id: "s-2", full_name: "Luis Gómez" };

export const CADENA: Topic = { id: "topic-1", name: "Regla de la cadena" };
export const LIMITES: Topic = { id: "topic-2", name: "Límites" };

export function startedSlot(hoursAgo = 2, overrides: Partial<SessionSlot> = {}): SessionSlot {
  const start = new Date(Date.now() - hoursAgo * HOUR);
  return {
    id: 21,
    subject: CALCULO_REF,
    monitor: MONITOR,
    term: "2026-2",
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + HOUR).toISOString(),
    capacity: 3,
    status: "AVAILABLE",
    modality: "IN_PERSON",
    location: "Bloque 14-203",
    ...overrides,
  };
}

export function pendingReservation(
  id: string,
  student: { id: string; full_name: string },
  slot: SessionSlot,
): Reservation {
  return {
    id,
    slot,
    student,
    status: "CONFIRMED",
    student_note: "",
    created_at: slot.starts_at,
    cancelled_at: null,
    cancelled_by: null,
    cancellation_reason: "",
  };
}

export function pendingSlot(): PendingSlot {
  const slot = startedSlot();
  return {
    slot,
    reservations: [pendingReservation("r-1", ANA, slot), pendingReservation("r-2", LUIS, slot)],
  };
}

export function session(overrides: Partial<TutoringSession> = {}): TutoringSession {
  const recorded = new Date(Date.now() - HOUR);
  return {
    id: "t-1",
    slot: startedSlot(3),
    topics: [CADENA],
    materials: [],
    notes: "Repasamos derivadas.",
    duration_minutes: 60,
    attendance: [
      { reservation_id: "r-1", student: ANA, attendance: "ATTENDED" },
      { reservation_id: "r-2", student: LUIS, attendance: "NO_SHOW" },
    ],
    recorded_at: recorded.toISOString(),
    updated_at: recorded.toISOString(),
    editable_until: new Date(recorded.getTime() + 48 * HOUR).toISOString(),
    ...overrides,
  };
}

export function historyItem(overrides: Partial<HistoryItem> = {}): HistoryItem {
  return {
    id: "r-1",
    slot: startedSlot(26),
    status: "COMPLETED",
    session: {
      id: "t-1",
      topics: [CADENA],
      duration_minutes: 60,
      recorded_at: new Date().toISOString(),
    },
    evaluation: null,
    ...overrides,
  };
}
