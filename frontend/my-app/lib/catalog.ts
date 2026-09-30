/**
 * Academic catalog endpoints (FASE-02): departments, subjects, terms, courses and monitor
 * assignments. Reading subjects, departments and terms is open to every signed-in person;
 * everything else requires ADMIN (or TEACHER for `courses/mine`, MONITOR for
 * `monitor-assignments/mine`), enforced by the API.
 *
 * `term` is always a term code (e.g. "2026-1"); leaving it out means the current term.
 */

import { ApiError, apiRequest } from "@/lib/api-client";
import type { components } from "@/types/api";

type Schemas = components["schemas"];

export type Department = Schemas["Department"];
export type DepartmentChanges = Schemas["PatchedDepartment"];
export type Subject = Schemas["Subject"];
export type SubjectPage = Schemas["PaginatedSubjectList"];
export type SubjectData = Schemas["SubjectWrite"];
export type SubjectChanges = Schemas["PatchedSubjectWrite"];
export type Term = Schemas["AcademicTerm"];
export type NewTerm = Omit<Term, "id">;
export type Course = Schemas["Course"];
export type CoursePage = Schemas["PaginatedCourseList"];
export type NewCourse = Schemas["CourseCreate"];
export type CourseChanges = Schemas["PatchedCourseUpdate"];
export type TeacherCourse = Schemas["TeacherCourse"];
export type AssignedMonitor = Schemas["AssignedMonitor"];
export type Assignment = Schemas["MonitorAssignment"];
export type AssignmentPage = Schemas["PaginatedMonitorAssignmentList"];
export type NewAssignment = Schemas["MonitorAssignmentCreate"];
export type MonitorOwnAssignment = Schemas["MonitorOwnAssignment"];
export type SubjectTeacher = Schemas["SubjectTeacher"];
export type CatalogSummary = Schemas["CatalogSummary"];

/** The API's DefaultPagination page size. */
export const CATALOG_PAGE_SIZE = 20;
/** The API's largest page, used for short reference lists (departments, terms). */
const FULL_PAGE_SIZE = 100;

/** Mirrors the API rule for term codes (TERM_CODE_PATTERN), with the same message. */
const TERM_CODE_PATTERN = /^\d{4}-[12]$/;
export const TERM_CODE_MESSAGE = "Usa el formato AAAA-S, con semestre 1 o 2 (por ejemplo 2026-1).";

export function isTermCode(value: string): boolean {
  return TERM_CODE_PATTERN.test(value);
}

// --- Filters ---------------------------------------------------------------------------------

export type SubjectFilters = {
  /** Matches code or name, ignoring case. */
  search: string;
  /** Department id or code. */
  department: string | null;
  credits: number | null;
  /** Only subjects with at least one monitor in the term. */
  hasMonitors: boolean;
  /** Administrators only: `null` lists active and inactive subjects. */
  active: boolean | null;
  /** Term code for `monitor_count`; `null` is the current term. */
  term: string | null;
};

export const NO_SUBJECT_FILTERS: SubjectFilters = {
  search: "",
  department: null,
  credits: null,
  hasMonitors: false,
  active: null,
  term: null,
};

export type CourseFilters = {
  /** Matches subject code or name, and teacher name or email. */
  search: string;
  term: string | null;
  department: string | null;
  withoutTeacher: boolean;
  withoutMonitors: boolean;
};

export const NO_COURSE_FILTERS: CourseFilters = {
  search: "",
  term: null,
  department: null,
  withoutTeacher: false,
  withoutMonitors: false,
};

export type AssignmentFilters = {
  /** Matches monitor name or email and subject code or name. */
  search: string;
  term: string | null;
};

export const NO_ASSIGNMENT_FILTERS: AssignmentFilters = { search: "", term: null };

type Params = Record<string, string | number | boolean | null | undefined>;

/** A query string with the empty values left out; booleans travel as "true"/"false". */
function query(params: Params): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

// --- Departments -----------------------------------------------------------------------------

/** Every department (administrators also receive inactive ones), ordered by name. */
export async function listAllDepartments(signal?: AbortSignal): Promise<Department[]> {
  const page = await apiRequest<Schemas["PaginatedDepartmentList"]>(
    `/departments/${query({ page_size: FULL_PAGE_SIZE })}`,
    { signal },
  );
  return page.results;
}

export function createDepartment(data: Omit<Department, "id">): Promise<Department> {
  return apiRequest<Department>("/departments/", { method: "POST", body: data });
}

export function updateDepartment(id: number, changes: DepartmentChanges): Promise<Department> {
  return apiRequest<Department>(`/departments/${id}/`, { method: "PATCH", body: changes });
}

// --- Subjects --------------------------------------------------------------------------------

export function listSubjects(
  page: number,
  filters: SubjectFilters,
  signal?: AbortSignal,
  pageSize?: number,
): Promise<SubjectPage> {
  return apiRequest<SubjectPage>(
    `/subjects/${query({
      page,
      page_size: pageSize,
      search: filters.search.trim(),
      department: filters.department,
      credits: filters.credits,
      has_monitors: filters.hasMonitors || null,
      active: filters.active,
      term: filters.term,
    })}`,
    { signal },
  );
}

export function getSubject(id: number, term: string | null, signal?: AbortSignal): Promise<Subject> {
  return apiRequest<Subject>(`/subjects/${id}/${query({ term })}`, { signal });
}

export function createSubject(data: SubjectData): Promise<Subject> {
  return apiRequest<Subject>("/subjects/", { method: "POST", body: data });
}

export function updateSubject(id: number, changes: SubjectChanges): Promise<Subject> {
  return apiRequest<Subject>(`/subjects/${id}/`, { method: "PATCH", body: changes });
}

// --- Terms -----------------------------------------------------------------------------------

/** Every term, newest first. */
export async function listAllTerms(signal?: AbortSignal): Promise<Term[]> {
  const page = await apiRequest<Schemas["PaginatedAcademicTermList"]>(
    `/terms/${query({ page_size: FULL_PAGE_SIZE })}`,
    { signal },
  );
  return page.results;
}

/** The term in progress (or the latest past, or the next one); null when none exist. */
export async function getCurrentTerm(signal?: AbortSignal): Promise<Term | null> {
  try {
    return await apiRequest<Term>("/terms/current/", { signal });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export function createTerm(data: NewTerm): Promise<Term> {
  return apiRequest<Term>("/terms/", { method: "POST", body: data });
}

// --- Courses ---------------------------------------------------------------------------------

export function listCourses(
  page: number,
  filters: CourseFilters,
  signal?: AbortSignal,
): Promise<CoursePage> {
  return apiRequest<CoursePage>(
    `/courses/${query({
      page,
      search: filters.search.trim(),
      term: filters.term,
      department: filters.department,
      without_teacher: filters.withoutTeacher || null,
      without_monitors: filters.withoutMonitors || null,
    })}`,
    { signal },
  );
}

export function createCourse(data: NewCourse): Promise<Course> {
  return apiRequest<Course>("/courses/", { method: "POST", body: data });
}

export function updateCourse(id: number, changes: CourseChanges): Promise<Course> {
  return apiRequest<Course>(`/courses/${id}/`, { method: "PATCH", body: changes });
}

/** The signed-in teacher's courses of a term, with their monitors. */
export async function listMyCourses(
  term: string | null,
  signal?: AbortSignal,
): Promise<TeacherCourse[]> {
  const page = await apiRequest<Schemas["PaginatedTeacherCourseList"]>(
    `/courses/mine/${query({ page_size: FULL_PAGE_SIZE, term })}`,
    { signal },
  );
  return page.results;
}

// --- Monitor assignments ---------------------------------------------------------------------

export function listAssignments(
  page: number,
  filters: AssignmentFilters,
  signal?: AbortSignal,
): Promise<AssignmentPage> {
  return apiRequest<AssignmentPage>(
    `/monitor-assignments/${query({ page, search: filters.search.trim(), term: filters.term })}`,
    { signal },
  );
}

/** The signed-in monitor's assignments of a term, with the teachers of each subject. */
export async function listMyAssignments(
  term: string | null,
  signal?: AbortSignal,
): Promise<MonitorOwnAssignment[]> {
  const page = await apiRequest<Schemas["PaginatedMonitorOwnAssignmentList"]>(
    `/monitor-assignments/mine/${query({ page_size: FULL_PAGE_SIZE, term })}`,
    { signal },
  );
  return page.results;
}

export function createAssignment(data: NewAssignment): Promise<Assignment> {
  return apiRequest<Assignment>("/monitor-assignments/", { method: "POST", body: data });
}

export function deleteAssignment(id: number): Promise<void> {
  return apiRequest<void>(`/monitor-assignments/${id}/`, { method: "DELETE" });
}

// --- Summary ---------------------------------------------------------------------------------

export function getCatalogSummary(term?: string | null, signal?: AbortSignal): Promise<CatalogSummary> {
  return apiRequest<CatalogSummary>(`/catalog/summary/${query({ term })}`, { signal });
}
