/** How the availability screens name slots, sessions and times, in Spanish and Bogotá time. */

import { isGroupSession, type Modality, type SlotStatus } from "@/lib/availability";

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

/** e.g. "Individual", "Grupal · 6 cupos". */
export function sessionLabel(capacity: number): string {
  return isGroupSession(capacity) ? `Grupal · ${numberFormat.format(capacity)} cupos` : "Individual";
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
