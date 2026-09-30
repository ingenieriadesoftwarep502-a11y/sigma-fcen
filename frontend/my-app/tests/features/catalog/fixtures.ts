import type {
  Assignment,
  CatalogSummary,
  Course,
  Department,
  Subject,
  Term,
} from "@/lib/catalog";
import type { AdminUser } from "@/lib/users";

export const MAT: Department = { id: 1, code: "MAT", name: "Matemáticas", is_active: true };
export const FIS: Department = { id: 2, code: "FIS", name: "Física", is_active: true };
export const QUI: Department = { id: 3, code: "QUI", name: "Química", is_active: false };

export const TERM_2: Term = { id: 2, code: "2026-2", start_date: "2026-08-01", end_date: "2026-12-10" };
export const TERM_1: Term = { id: 1, code: "2026-1", start_date: "2026-02-01", end_date: "2026-06-10" };

const MAT_REF = { id: MAT.id, code: MAT.code, name: MAT.name };

export const CALCULO: Subject = {
  id: 1,
  code: "MAT-101",
  name: "Cálculo diferencial",
  credits: 4,
  is_active: true,
  department: MAT_REF,
  monitor_count: 2,
};

export const ALGEBRA: Subject = {
  id: 2,
  code: "MAT-102",
  name: "Álgebra lineal",
  credits: 3,
  is_active: false,
  department: MAT_REF,
  monitor_count: 0,
};

export const COURSE_WITH_TEACHER: Course = {
  id: 10,
  subject: { id: 1, code: "MAT-101", name: "Cálculo diferencial", credits: 4, department: MAT_REF },
  term: "2026-2",
  group: "2",
  teacher: { id: "t-1", email: "marta@unal.edu.co", full_name: "Marta Ruiz" },
  monitor_count: 2,
};

export const COURSE_WITHOUT_TEACHER: Course = {
  id: 11,
  subject: { id: 2, code: "MAT-102", name: "Álgebra lineal", credits: 3, department: MAT_REF },
  term: "2026-2",
  group: "1",
  teacher: null,
  monitor_count: 0,
};

export const ANA_ASSIGNMENT: Assignment = {
  id: 30,
  monitor: { id: "m-1", email: "ana@unal.edu.co", full_name: "Ana Pérez" },
  subject: { id: 1, code: "MAT-101", name: "Cálculo diferencial" },
  term: "2026-2",
  committed_hours: 6,
};

export const SUMMARY: CatalogSummary = {
  term: "2026-2",
  subjects_active: 120,
  departments_active: 6,
  courses: 48,
  courses_without_teacher: 5,
  courses_without_monitor: 12,
  monitor_assignments: 30,
  committed_hours_total: 180,
};

export const TEACHER: AdminUser = {
  id: "t-2",
  email: "luis@unal.edu.co",
  first_name: "Luis",
  last_name: "Gómez",
  roles: ["TEACHER"],
  is_active: true,
  date_joined: "2026-01-10T10:00:00Z",
};

export const MONITOR: AdminUser = {
  id: "m-2",
  email: "sofia@unal.edu.co",
  first_name: "Sofía",
  last_name: "Ríos",
  roles: ["STUDENT", "MONITOR"],
  is_active: true,
  date_joined: "2026-01-10T10:00:00Z",
};

export function pageOf<T>(results: T[], count = results.length) {
  return { count, next: null, previous: null, results };
}
