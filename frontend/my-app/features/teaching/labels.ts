/** How the teacher follow-up names its figures, in Spanish. */

import type { TeachingCourse } from "@/lib/teaching";

/** e.g. "1 sesión", "9 sesiones". */
export function sessionCountLabel(count: number): string {
  return `${count} ${count === 1 ? "sesión" : "sesiones"}`;
}

/** e.g. "1000004 · Cálculo Diferencial · Grupo 1". */
export function courseLabel(course: TeachingCourse): string {
  return `${course.subject.code} · ${course.subject.name} · Grupo ${course.group}`;
}
