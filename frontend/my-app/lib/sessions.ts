/**
 * Tutoring-session endpoints (FASE-05): the slot's monitor records what happened in a slot
 * that already started, and corrects it for 48 hours; a student reads their history.
 *
 * One session per slot (group slots included): it marks the attendance of every CONFIRMED
 * reservation of the slot, which then becomes COMPLETED or NO_SHOW. Attendance is final once
 * recorded; topics, notes, material and duration can still be corrected (RN-006.8). A student
 * never reads the monitor's notes nor the attendance of others (RN-006.9).
 *
 * Errors follow SAD §6.3; a 409 means the session was already recorded, or the edit window
 * closed.
 */

import { apiRequest, queryString } from "@/lib/api-client";
import type { Reservation } from "@/lib/reservations";
import type { components } from "@/types/api";

type Schemas = components["schemas"];

export type TutoringSession = Schemas["TutoringSession"];
export type SessionPage = Schemas["PaginatedTutoringSessionList"];
export type SessionCreate = Schemas["SessionCreate"];
export type SessionUpdate = Schemas["PatchedSessionUpdate"];
export type AttendanceStatus = Schemas["AttendanceEnum"];
export type HistoryItem = Schemas["HistoryItem"];
export type HistoryPage = Schemas["PaginatedHistoryItemList"];
export type HistoryStatus = Schemas["HistoryItemStatusEnum"];
export type Topic = Schemas["Topic"];
export type SessionSlot = Schemas["ReservationSlot"];

/** RF-052: a recorded session can be corrected for this many hours. */
export const EDIT_WINDOW_HOURS = 48;
export const MAX_NOTES_LENGTH = 2000;
export const MAX_DURATION_MINUTES = 180;
export const MAX_TOPIC_NAME_LENGTH = 80;

/** Pending reservations come in one page; a monitor never has this many unrecorded. */
const PENDING_PAGE_SIZE = 100;

export type MySessionFilters = { subject: number | null };
export type HistoryFilters = { status: HistoryStatus | null; subject: number | null };

export const NO_HISTORY_FILTERS: HistoryFilters = { status: null, subject: null };

/** A slot that already started and still has CONFIRMED reservations to mark. */
export type PendingSlot = { slot: SessionSlot; reservations: Reservation[] };

function withTrimmedNotes<T extends { notes?: string }>(data: T): T {
  return data.notes === undefined ? data : { ...data, notes: data.notes.trim() };
}

export function recordSession(data: SessionCreate): Promise<TutoringSession> {
  return apiRequest<TutoringSession>("/tutoring-sessions/", {
    method: "POST",
    body: withTrimmedNotes(data),
  });
}

/** Only the fields present change; attendance cannot be corrected (RN-006.8). */
export function updateSession(id: string, changes: SessionUpdate): Promise<TutoringSession> {
  return apiRequest<TutoringSession>(`/tutoring-sessions/${id}/`, {
    method: "PATCH",
    body: withTrimmedNotes(changes),
  });
}

export function listMySessions(
  page: number,
  filters: MySessionFilters,
  signal?: AbortSignal,
): Promise<SessionPage> {
  return apiRequest<SessionPage>(
    `/tutoring-sessions/mine/${queryString({ page, subject: filters.subject })}`,
    { signal },
  );
}

/** HU-12: the signed-in student's closed reservations, latest first. */
export function listHistory(
  page: number,
  filters: HistoryFilters,
  signal?: AbortSignal,
): Promise<HistoryPage> {
  return apiRequest<HistoryPage>(
    `/tutoring-sessions/history/${queryString({
      page,
      status: filters.status,
      subject: filters.subject,
    })}`,
    { signal },
  );
}

export function listTopics(subjectId: number, signal?: AbortSignal): Promise<Topic[]> {
  return apiRequest<Topic[]>(`/topics/${queryString({ subject: subjectId })}`, { signal });
}

/** Creates the topic, or returns the existing one with that name (ignoring case). */
export function addTopic(subjectId: number, name: string): Promise<Topic> {
  return apiRequest<Topic>("/topics/", {
    method: "POST",
    body: { subject_id: subjectId, name: name.trim() },
  });
}

/** The reservations of each slot together, the latest slot first. */
export function groupPendingBySlot(reservations: readonly Reservation[]): PendingSlot[] {
  const bySlot = new Map<number, PendingSlot>();
  for (const reservation of reservations) {
    const group = bySlot.get(reservation.slot.id);
    if (group) {
      group.reservations.push(reservation);
    } else {
      bySlot.set(reservation.slot.id, { slot: reservation.slot, reservations: [reservation] });
    }
  }
  return [...bySlot.values()].sort(
    (a, b) => new Date(b.slot.starts_at).getTime() - new Date(a.slot.starts_at).getTime(),
  );
}

/** The monitor's started slots whose session is still to be recorded. */
export async function listPendingSlots(signal?: AbortSignal): Promise<PendingSlot[]> {
  const page = await apiRequest<{ results: Reservation[] }>(
    `/reservations/mine/${queryString({
      role: "monitor",
      status: "CONFIRMED",
      when: "past",
      page_size: PENDING_PAGE_SIZE,
    })}`,
    { signal },
  );
  return groupPendingBySlot(page.results);
}

/** RF-052: the session can still be corrected. */
export function isEditable(
  session: Pick<TutoringSession, "editable_until">,
  now: Date = new Date(),
): boolean {
  return new Date(session.editable_until).getTime() > now.getTime();
}
