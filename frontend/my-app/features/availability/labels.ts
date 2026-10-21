/** How the availability screens name slots, sessions and times, in Spanish and Bogotá time. */

import { bogotaDateTime, isGroupSession, type Modality, type SlotStatus } from "@/lib/availability";

const numberFormat = new Intl.NumberFormat("es-CO");

export const MODALITY_LABELS: Record<Modality, string> = {
  IN_PERSON: "Presencial",
  VIRTUAL: "Virtual",
};

/** RESERVED means every seat is taken (ADR-010, 2026-10-15 extension). */
export const STATUS_LABELS: Record<SlotStatus, string> = {
  AVAILABLE: "Disponible",
  RESERVED: "Sin cupos",
  CANCELLED: "Retirada",
  EXPIRED: "Vencida",
};

/** Index 0 is Monday, as the API counts weekdays. */
export const WEEKDAY_LABELS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
] as const;

/** e.g. "Individual · 1 cupo", "Grupal · 6 cupos": the session type and its seats. */
export function sessionLabel(capacity: number): string {
  return isGroupSession(capacity)
    ? `Grupal · ${numberFormat.format(capacity)} cupos`
    : "Individual · 1 cupo";
}

/**
 * What a student needs to book: "Individual · 1 cupo", or the free seats of a group session,
 * e.g. "Grupal · 2 de 5 cupos libres" (ADR-010 R4).
 */
export function seatsLabel(capacity: number, remaining: number): string {
  if (!isGroupSession(capacity)) return sessionLabel(capacity);
  const free = remaining === 1 ? "cupo libre" : "cupos libres";
  return `Grupal · ${numberFormat.format(remaining)} de ${numberFormat.format(capacity)} ${free}`;
}

/** e.g. "3 franjas". */
export function slotsCountLabel(count: number): string {
  return `${numberFormat.format(count)} ${count === 1 ? "franja" : "franjas"}`;
}

/** What the location field holds for each modality. */
export function locationLabel(modality: Modality): string {
  return modality === "VIRTUAL" ? "Enlace de la sesión" : "Aula o lugar";
}

const dayFormat = new Intl.DateTimeFormat("es-CO", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "America/Bogota",
});

const timeFormat = new Intl.DateTimeFormat("es-CO", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "America/Bogota",
});

/** e.g. "martes, 20 de octubre". */
export function slotDayLabel(iso: string): string {
  return dayFormat.format(new Date(iso));
}

/** e.g. "10:00–11:00", Bogotá time. */
export function slotTimeRange(startsAt: string, endsAt: string): string {
  return `${timeFormat.format(new Date(startsAt))}–${timeFormat.format(new Date(endsAt))}`;
}

/** A template's weekly hour, e.g. "14:30–15:30", for sessions of `minutes` length. */
export function templateTimeRange(startTime: string, minutes = 60): string {
  const [hours = 0, mins = 0] = startTime.split(":").map(Number);
  const end = hours * 60 + mins + minutes;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(hours)}:${pad(mins)}–${pad(Math.floor(end / 60) % 24)}:${pad(end % 60)}`;
}

/** e.g. "6 franjas disponibles". */
export function availableSlotsLabel(count: number): string {
  return `${slotsCountLabel(count)} ${count === 1 ? "disponible" : "disponibles"}`;
}

const shortDayParts = new Intl.DateTimeFormat("es-CO", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "America/Bogota",
});

/** "Hoy" or "Mañana" when `iso` falls on today or tomorrow in Bogotá; null otherwise. */
export function relativeDayLabel(iso: string, now: Date = new Date()): string | null {
  const day = bogotaDateTime(iso).date;
  const today = bogotaDateTime(now.toISOString()).date;
  if (day === today) return "Hoy";
  // Bogotá has no daylight saving: a day later is always 24 hours later.
  const tomorrow = bogotaDateTime(new Date(now.getTime() + 86_400_000).toISOString()).date;
  return day === tomorrow ? "Mañana" : null;
}

/** e.g. "Hoy, 14:00", "Mañana, 10:00" or "mié 22 oct, 10:00", Bogotá time. */
export function nextSlotLabel(iso: string, now: Date = new Date()): string {
  const time = timeFormat.format(new Date(iso));
  const relative = relativeDayLabel(iso, now);
  if (relative) return `${relative}, ${time}`;
  const parts = Object.fromEntries(
    shortDayParts.formatToParts(new Date(iso)).map((part) => [part.type, part.value]),
  );
  const strip = (value = "") => value.replace(".", "");
  return `${strip(parts.weekday)} ${parts.day} ${strip(parts.month)}, ${time}`;
}

/** e.g. "1 h", "1 h 30 min" or "45 min": how long the session lasts. */
export function durationLabel(startsAt: string, endsAt: string): string {
  const minutes = Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
