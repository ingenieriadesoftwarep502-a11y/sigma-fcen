/** Dates and times as the interface shows them: Colombian Spanish, Bogotá time. */

const dateFormat = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Bogota",
});

const dateTimeFormat = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

const relativeFormat = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30.4375 * DAY;
const YEAR = 365.25 * DAY;

/** e.g. "1 feb 2026". */
export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso)).replace(/\s+de\s+/g, " ");
}

/** e.g. "29 de septiembre de 2026, 9:00 a. m.", for tooltips next to a relative time. */
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

/** e.g. "hace 5 minutos", "ayer", "hace 3 meses". */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const seconds = (new Date(iso).getTime() - now.getTime()) / 1000;
  const elapsed = Math.abs(seconds);
  if (elapsed < 45) return "hace un momento";
  if (elapsed < HOUR) return relativeFormat.format(Math.round(seconds / MINUTE), "minute");
  if (elapsed < DAY) return relativeFormat.format(Math.round(seconds / HOUR), "hour");
  if (elapsed < 30 * DAY) return relativeFormat.format(Math.round(seconds / DAY), "day");
  if (elapsed < YEAR) return relativeFormat.format(Math.round(seconds / MONTH), "month");
  return relativeFormat.format(Math.round(seconds / YEAR), "year");
}
