/**
 * Availability endpoints (FASE-03): a monitor's slots and weekly templates, and the slot
 * search every signed-in person may use. Publishing and editing require MONITOR and an
 * assignment on the subject and term, enforced by the API (RN-003.5).
 *
 * Times travel in ISO 8601 with their offset and are shown in Bogotá time (RNF-DAT-001);
 * `date_from`/`date_to` are Bogotá calendar dates. Capacity 1 is an individual session and
 * more than 1 a group session (ADR-010, 2026-10-15 extension).
 */

import { apiRequest, queryString } from "@/lib/api-client";
import type { components } from "@/types/api";

type Schemas = components["schemas"];

export type Slot = Schemas["AvailabilitySlot"];
export type SlotPage = Schemas["PaginatedAvailabilitySlotList"];
export type SlotStatus = Schemas["StatusEnum"];
export type Modality = Schemas["ModalityEnum"];
export type NewSlot = Schemas["SlotCreate"];
export type SlotChanges = Schemas["PatchedSlotUpdate"];
export type SlotTemplate = Schemas["SlotTemplate"];
export type SlotTemplatePage = Schemas["PaginatedSlotTemplateList"];
export type NewSlotTemplate = Schemas["SlotTemplateCreate"];

/** The API's DefaultPagination page size. */
export const AVAILABILITY_PAGE_SIZE = 20;

/** The API stores capacity as a positive small integer. */
export const MAX_SLOT_CAPACITY = 32767;

/** Longest classroom or link the API accepts. */
export const MAX_LOCATION_LENGTH = 200;

/** Bogotá keeps UTC-5 all year: no daylight saving to account for. */
const BOGOTA_OFFSET = "-05:00";

/** Slots start on the hour or on the half hour, Bogotá time (RN-003.6). */
export const HALF_HOURS: readonly string[] = Array.from({ length: 48 }, (_, index) => {
  const hours = String(Math.floor(index / 2)).padStart(2, "0");
  return `${hours}:${index % 2 === 0 ? "00" : "30"}`;
});

/** A Bogotá calendar date ("2026-10-20") and start ("10:30") as an ISO instant with offset. */
export function toBogotaIso(date: string, time: string): string {
  return `${date}T${time}:00${BOGOTA_OFFSET}`;
}

const bogotaParts = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "America/Bogota",
});

/** An instant read back as a Bogotá date and time, e.g. to fill an edit form. */
export function bogotaDateTime(iso: string): { date: string; time: string } {
  const parts = Object.fromEntries(
    bogotaParts.formatToParts(new Date(iso)).map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

/** More than one seat: several students share the session. */
export function isGroupSession(capacity: number): boolean {
  return capacity > 1;
}

// --- The monitor's slots ---------------------------------------------------------------------

export type MySlotFilters = {
  /** Term code; null is the current term. */
  term: string | null;
  /** Subject id; null lists every subject. */
  subject: number | null;
  /** null lists every state. */
  status: SlotStatus | null;
};

export const NO_MY_SLOT_FILTERS: MySlotFilters = { term: null, subject: null, status: null };

export function listMySlots(
  page: number,
  filters: MySlotFilters,
  signal?: AbortSignal,
): Promise<SlotPage> {
  return apiRequest<SlotPage>(
    `/availability-slots/mine/${queryString({
      page,
      term: filters.term,
      subject: filters.subject,
      status: filters.status,
    })}`,
    { signal },
  );
}

export function createSlot(data: NewSlot): Promise<Slot> {
  return apiRequest<Slot>("/availability-slots/", { method: "POST", body: data });
}

/** Only AVAILABLE slots can change; anything else answers 409. */
export function updateSlot(id: number, changes: SlotChanges): Promise<Slot> {
  return apiRequest<Slot>(`/availability-slots/${id}/`, { method: "PATCH", body: changes });
}

/** Withdraws the slot: it becomes CANCELLED and is kept, never deleted. */
export function cancelSlot(id: number): Promise<void> {
  return apiRequest<void>(`/availability-slots/${id}/`, { method: "DELETE" });
}

// --- Weekly templates ------------------------------------------------------------------------

export type TemplateFilters = {
  /** Term code; null is the current term. */
  term: string | null;
  /** Subject id; null lists every subject. */
  subject: number | null;
};

export function listMyTemplates(
  page: number,
  filters: TemplateFilters,
  signal?: AbortSignal,
): Promise<SlotTemplatePage> {
  return apiRequest<SlotTemplatePage>(
    `/slot-templates/mine/${queryString({ page, term: filters.term, subject: filters.subject })}`,
    { signal },
  );
}

/** Creates the template and its dated slots, all or nothing (ADR-010, condition c). */
export function createTemplate(data: NewSlotTemplate): Promise<SlotTemplate> {
  return apiRequest<SlotTemplate>("/slot-templates/", { method: "POST", body: data });
}

/** Deactivates the template and withdraws its future slots without a reservation. */
export function deactivateTemplate(id: number): Promise<void> {
  return apiRequest<void>(`/slot-templates/${id}/`, { method: "DELETE" });
}

// --- Search ----------------------------------------------------------------------------------

export type SlotSearchFilters = {
  /** Term code; null searches every term. */
  term: string | null;
  subject: { id: number; code: string; name: string } | null;
  monitor: { id: string; name: string } | null;
  modality: Modality | null;
  /** Bogotá calendar dates, both included. */
  dateFrom: string | null;
  dateTo: string | null;
};

export const NO_SLOT_SEARCH_FILTERS: SlotSearchFilters = {
  term: null,
  subject: null,
  monitor: null,
  modality: null,
  dateFrom: null,
  dateTo: null,
};

/** Only AVAILABLE, future slots, ordered by start (CA-HU02-1). */
export function searchSlots(
  page: number,
  filters: SlotSearchFilters,
  signal?: AbortSignal,
): Promise<SlotPage> {
  return apiRequest<SlotPage>(
    `/availability-slots/search/${queryString({
      page,
      term: filters.term,
      subject: filters.subject?.id,
      monitor: filters.monitor?.id,
      modality: filters.modality,
      date_from: filters.dateFrom,
      date_to: filters.dateTo,
    })}`,
    { signal },
  );
}
