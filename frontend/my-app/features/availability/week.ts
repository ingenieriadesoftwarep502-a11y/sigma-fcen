/**
 * Calendar arithmetic on Bogotá calendar dates ("2026-10-20"), for the monitor's week view.
 * Dates are handled as UTC midnights so no local time zone or DST ever shifts a day; Bogotá
 * itself keeps UTC-5 all year.
 */

import { bogotaDateTime } from "@/lib/availability";

const DAY_MS = 86_400_000;

function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function fromUtc(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Today in Bogotá. */
export function todayInBogota(now: Date = new Date()): string {
  return bogotaDateTime(now.toISOString()).date;
}

/** The current Bogotá time as minutes after midnight. */
export function minutesNowInBogota(now: Date = new Date()): number {
  return minutesOfDay(now.toISOString());
}

export function addDays(date: string, days: number): string {
  return fromUtc(new Date(toUtc(date).getTime() + days * DAY_MS));
}

/** The Monday of the week `date` falls in. */
export function mondayOf(date: string): string {
  const weekday = (toUtc(date).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(date, -weekday);
}

/** The seven dates of the week starting on `monday`. */
export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

/** Minutes after midnight, Bogotá time, of an instant. */
export function minutesOfDay(iso: string): number {
  const [hours = 0, minutes = 0] = bogotaDateTime(iso).time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** "10:30" for 630 minutes. */
export function clockLabel(minutes: number): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

const dayNumber = new Intl.DateTimeFormat("es-CO", { day: "numeric", timeZone: "UTC" });
const weekdayShort = new Intl.DateTimeFormat("es-CO", { weekday: "short", timeZone: "UTC" });
const monthLong = new Intl.DateTimeFormat("es-CO", { month: "long", timeZone: "UTC" });
const monthShort = new Intl.DateTimeFormat("es-CO", { month: "short", timeZone: "UTC" });
const fullDay = new Intl.DateTimeFormat("es-CO", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** "lun", "mar"…, without the trailing dot some locales add. */
export function weekdayLabel(date: string): string {
  return weekdayShort.format(toUtc(date)).replace(".", "");
}

/** "20". */
export function dayOfMonth(date: string): string {
  return dayNumber.format(toUtc(date));
}

/** "martes, 20 de octubre". */
export function fullDayLabel(date: string): string {
  return fullDay.format(toUtc(date));
}

/** "20 – 26 de octubre" or "27 oct – 2 nov", for the week starting on `monday`. */
export function weekRangeLabel(monday: string): string {
  const sunday = addDays(monday, 6);
  const start = toUtc(monday);
  const end = toUtc(sunday);
  if (start.getUTCMonth() === end.getUTCMonth()) {
    return `${dayNumber.format(start)} – ${dayNumber.format(end)} de ${monthLong.format(end)}`;
  }
  const short = (value: Date) =>
    `${dayNumber.format(value)} ${monthShort.format(value).replace(".", "")}`;
  return `${short(start)} – ${short(end)}`;
}
