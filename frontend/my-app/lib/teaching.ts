/**
 * Teacher follow-up endpoints (FASE-08, HU-09): read-only views of the teacher's own
 * courses — monitors, recorded sessions, students who attended and frequent topics.
 *
 * A session belongs to a course when its slot has the course's subject and term. The API
 * scopes every query to the teacher's courses and answers 403 for anyone else's
 * (RN-009.1); the course is always sent so the server applies the filter.
 *
 * RF-083, confirmed 2026-11-10: the frequent difficulties are the topics most repeated
 * across the course's sessions, most frequent first. Students appear by name only, and no
 * evaluation reaches the teacher (RNF-SEC-004, RF-062).
 */

import { apiRequest, queryString } from "@/lib/api-client";
import type { components } from "@/types/api";

type Schemas = components["schemas"];

export type TeachingCourse = Schemas["TeachingCourse"];
export type TeachingMonitor = Schemas["TeachingMonitor"];
export type TeachingSession = Schemas["TeachingSession"];
export type TeachingSessionPage = Schemas["PaginatedTeachingSessionList"];
export type TeachingStudent = Schemas["TeachingStudent"];
export type TeachingStudentPage = Schemas["PaginatedTeachingStudentList"];
export type FrequentTopic = Schemas["FrequentTopic"];

/** A teacher has few courses and monitors: one page holds them all. */
const ALL = 100;
export const SESSIONS_PAGE_SIZE = 10;
/** How many of the most repeated topics the panel shows. */
export const TOP_TOPICS = 5;

/** Mirror of backend/apps/analytics/domain/rules.py; the API stays authoritative. */
export const INVERTED_RANGE_MESSAGE = "La fecha final no puede ser anterior a la inicial.";

/** Dates are calendar days ("2026-09-01") in Bogotá, both included. */
export type SessionDates = { dateFrom: string | null; dateTo: string | null };
export type SessionFilters = SessionDates & { course: number };

export const NO_SESSION_DATES: SessionDates = { dateFrom: null, dateTo: null };

type Page<T> = { results: T[] };

/** The teacher's courses of a term (null: the current one) with their indicators. */
export async function listTeachingCourses(
  term: string | null,
  signal?: AbortSignal,
): Promise<TeachingCourse[]> {
  const page = await apiRequest<Page<TeachingCourse>>(
    `/teaching/courses/${queryString({ term, page_size: ALL })}`,
    { signal },
  );
  return page.results;
}

export function getTeachingCourse(id: number, signal?: AbortSignal): Promise<TeachingCourse> {
  return apiRequest<TeachingCourse>(`/teaching/courses/${id}/`, { signal });
}

export async function listCourseMonitors(
  course: number,
  signal?: AbortSignal,
): Promise<TeachingMonitor[]> {
  const page = await apiRequest<Page<TeachingMonitor>>(
    `/teaching/monitors/${queryString({ course, page_size: ALL })}`,
    { signal },
  );
  return page.results;
}

/** `count` is the number of distinct students who attended (RF-082). */
export function listCourseStudents(
  course: number,
  signal?: AbortSignal,
): Promise<TeachingStudentPage> {
  return apiRequest<TeachingStudentPage>(
    `/teaching/students/${queryString({ course, page_size: ALL })}`,
    { signal },
  );
}

/** The most repeated topics of the course's sessions (RF-083). */
export async function listFrequentTopics(
  course: number,
  signal?: AbortSignal,
): Promise<FrequentTopic[]> {
  const page = await apiRequest<Page<FrequentTopic>>(
    `/teaching/frequent-topics/${queryString({ course, page_size: TOP_TOPICS })}`,
    { signal },
  );
  return page.results;
}

/** The course's sessions, latest first, one page at a time (T-08.12). */
export function listCourseSessions(
  page: number,
  filters: SessionFilters,
  signal?: AbortSignal,
): Promise<TeachingSessionPage> {
  const query = queryString({
    course: filters.course,
    date_from: filters.dateFrom,
    date_to: filters.dateTo,
    page,
    page_size: SESSIONS_PAGE_SIZE,
  });
  return apiRequest<TeachingSessionPage>(`/teaching/sessions/${query}`, { signal });
}

/** The message the API would answer for an inverted range, or null. */
export function dateRangeError(dateFrom: string | null, dateTo: string | null): string | null {
  return dateFrom && dateTo && dateTo < dateFrom ? INVERTED_RANGE_MESSAGE : null;
}
