import type { Slot, SlotTemplate } from "@/lib/availability";
import type { MonitorOwnAssignment, Term } from "@/lib/catalog";

export const TERM_2: Term = { id: 2, code: "2026-2", start_date: "2026-08-01", end_date: "2026-12-10" };
export const TERM_1: Term = { id: 1, code: "2026-1", start_date: "2026-02-01", end_date: "2026-06-10" };

const MAT = { id: 1, code: "MAT", name: "Matemáticas" };
const FIS = { id: 2, code: "FIS", name: "Física" };

export const CALCULO_REF = { id: 1, code: "MAT-101", name: "Cálculo diferencial" };
export const MECANICA_REF = { id: 2, code: "FIS-201", name: "Mecánica" };

export const CALCULO_ASSIGNMENT: MonitorOwnAssignment = {
  id: 10,
  subject: { ...CALCULO_REF, credits: 4, department: MAT },
  term: "2026-2",
  committed_hours: 6,
  teachers: [],
  upcoming_slots: 0,
  next_slot_at: null,
  active_templates: 0,
};

export const MECANICA_ASSIGNMENT: MonitorOwnAssignment = {
  id: 11,
  subject: { ...MECANICA_REF, credits: 3, department: FIS },
  term: "2026-2",
  committed_hours: 4,
  teachers: [],
  upcoming_slots: 0,
  next_slot_at: null,
  active_templates: 0,
};

export const ANA = { id: "m-1", full_name: "Ana Pérez" };

/** Tuesday 20 October 2026, 10:00–11:00 in Bogotá. */
export const INDIVIDUAL_SLOT: Slot = {
  id: 21,
  subject: CALCULO_REF,
  monitor: ANA,
  term: "2026-2",
  template: null,
  starts_at: "2026-10-20T15:00:00Z",
  ends_at: "2026-10-20T16:00:00Z",
  capacity: 1,
  status: "AVAILABLE",
  modality: "IN_PERSON",
  location: "Bloque 14-203",
};

/** Wednesday 21 October 2026, 14:30–15:30 in Bogotá. */
export const GROUP_SLOT: Slot = {
  id: 22,
  subject: MECANICA_REF,
  monitor: ANA,
  term: "2026-2",
  template: 3,
  starts_at: "2026-10-21T19:30:00Z",
  ends_at: "2026-10-21T20:30:00Z",
  capacity: 6,
  status: "AVAILABLE",
  modality: "VIRTUAL",
  location: "https://meet.example.org/fis",
};

export const RESERVED_SLOT: Slot = {
  ...INDIVIDUAL_SLOT,
  id: 23,
  starts_at: "2026-10-22T15:00:00Z",
  ends_at: "2026-10-22T16:00:00Z",
  status: "RESERVED",
};

export const WEEKLY_TEMPLATE: SlotTemplate = {
  id: 3,
  subject: MECANICA_REF,
  term: "2026-2",
  weekday: 2,
  start_time: "14:30:00",
  capacity: 6,
  modality: "VIRTUAL",
  location: "https://meet.example.org/fis",
  is_active: true,
  slots_created: 8,
};

export const INACTIVE_TEMPLATE: SlotTemplate = {
  ...WEEKLY_TEMPLATE,
  id: 4,
  weekday: 0,
  start_time: "08:00:00",
  capacity: 1,
  modality: "IN_PERSON",
  location: "Bloque 14-203",
  subject: CALCULO_REF,
  is_active: false,
  slots_created: 5,
};

export function pageOf<T>(results: T[], count = results.length) {
  return { count, next: null, previous: null, results };
}
