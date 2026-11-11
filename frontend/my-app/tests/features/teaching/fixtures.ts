import type {
  FrequentTopic,
  TeachingCourse,
  TeachingMonitor,
  TeachingSession,
  TeachingStudent,
} from "@/lib/teaching";

export const CALCULO_SUBJECT = { id: 1, code: "1000004", name: "Cálculo Diferencial" };
export const ALGEBRA_SUBJECT = { id: 2, code: "1000003", name: "Álgebra Lineal" };

export function teachingCourse(overrides: Partial<TeachingCourse> = {}): TeachingCourse {
  return {
    id: 10,
    subject: CALCULO_SUBJECT,
    term: "2026-2",
    group: "1",
    monitor_count: 1,
    session_count: 24,
    student_count: 18,
    ...overrides,
  };
}

export const ALGEBRA_COURSE = teachingCourse({
  id: 11,
  subject: ALGEBRA_SUBJECT,
  group: "3",
  monitor_count: 0,
  session_count: 0,
  student_count: 0,
});

export function teachingMonitor(overrides: Partial<TeachingMonitor> = {}): TeachingMonitor {
  return {
    id: "m-1",
    full_name: "Sofía Díaz",
    email: "sofia.diaz@unal.edu.co",
    subject: CALCULO_SUBJECT,
    term: "2026-2",
    committed_hours: 6,
    session_count: 24,
    ...overrides,
  };
}

export function frequentTopic(overrides: Partial<FrequentTopic> = {}): FrequentTopic {
  return {
    id: "t-1",
    name: "Límites laterales",
    subject: CALCULO_SUBJECT,
    session_count: 9,
    ...overrides,
  };
}

export function teachingStudent(overrides: Partial<TeachingStudent> = {}): TeachingStudent {
  return {
    full_name: "Ana Pérez",
    session_count: 3,
    last_attended_at: "2026-09-15T15:00:00Z",
    ...overrides,
  };
}

export function teachingSession(overrides: Partial<TeachingSession> = {}): TeachingSession {
  return {
    id: "s-1",
    starts_at: "2026-09-15T15:00:00Z",
    ends_at: "2026-09-15T16:00:00Z",
    subject: CALCULO_SUBJECT,
    term: "2026-2",
    monitor: { id: "m-1", full_name: "Sofía Díaz" },
    topics: [{ id: "t-1", name: "Límites laterales" }],
    students: [{ full_name: "Ana Pérez" }, { full_name: "Luis Gómez" }],
    duration_minutes: 60,
    ...overrides,
  };
}
