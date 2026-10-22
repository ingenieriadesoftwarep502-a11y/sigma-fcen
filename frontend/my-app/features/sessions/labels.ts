/** How the session screens name attendance and outcomes, in Spanish. */

import type { AttendanceStatus, HistoryStatus, TutoringSession } from "@/lib/sessions";

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  ATTENDED: "Asistió",
  NO_SHOW: "No asistió",
};

/** The student reads their own outcome. A late cancellation is a no-show too (ADR-011). */
export const HISTORY_STATUS_LABELS: Record<HistoryStatus, string> = {
  COMPLETED: "Asististe",
  NO_SHOW: "Inasistencia",
};

export const TOPIC_REQUIRED_MESSAGE = "Si alguien asistió, indica al menos un tema trabajado.";

/** e.g. "2 asistieron · 1 no asistió". */
export function attendanceSummary(rows: TutoringSession["attendance"]): string {
  const attended = rows.filter((row) => row.attendance === "ATTENDED").length;
  const absent = rows.length - attended;
  const parts: string[] = [];
  if (attended > 0) parts.push(`${attended} ${attended === 1 ? "asistió" : "asistieron"}`);
  if (absent > 0) parts.push(`${absent} no ${absent === 1 ? "asistió" : "asistieron"}`);
  return parts.join(" · ");
}

/** e.g. "60 min". */
export function durationLabel(minutes: number): string {
  return `${minutes} min`;
}
