/**
 * Catalog filters as URL query parameters, so a filtered view survives a reload and can be
 * shared. Parameter names and values are Spanish, like the rest of the URL; anything
 * malformed is ignored rather than sent to the API.
 */

import {
  type AssignmentFilters,
  type CourseFilters,
  isTermCode,
  NO_ASSIGNMENT_FILTERS,
  NO_COURSE_FILTERS,
  NO_SUBJECT_FILTERS,
  type SubjectFilters,
} from "@/lib/catalog";

type Readable = Pick<URLSearchParams, "get">;

/** The tabs of catalog administration, as `?vista=` values. */
export const CATALOG_VIEWS = ["asignaturas", "cursos", "monitores", "organizacion"] as const;
export type CatalogView = (typeof CATALOG_VIEWS)[number];

export function viewFromParams(params: Readable): CatalogView {
  const view = params.get("vista");
  return (CATALOG_VIEWS as readonly string[]).includes(view ?? "")
    ? (view as CatalogView)
    : "asignaturas";
}

const DEPARTMENT_CODE = /^[A-Z][A-Z0-9]{0,19}$/;

function department(params: Readable): string | null {
  const value = params.get("departamento");
  return value && DEPARTMENT_CODE.test(value) ? value : null;
}

function term(params: Readable): string | null {
  const value = params.get("periodo");
  return value && isTermCode(value) ? value : null;
}

function flag(params: Readable, name: string): boolean {
  return params.get(name) === "1";
}

function credits(params: Readable): number | null {
  const value = params.get("creditos");
  return value && /^[1-9]\d?$/.test(value) ? Number(value) : null;
}

function status(params: Readable): boolean | null {
  const value = params.get("estado");
  if (value === "activas") return true;
  if (value === "inactivas") return false;
  return null;
}

/** Sets only the values in use, in the order given. */
function build(entries: [string, string | number | boolean | null][]): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of entries) {
    if (value === null || value === false || value === "") continue;
    params.set(key, value === true ? "1" : String(value));
  }
  return params;
}

// --- Student explorer ------------------------------------------------------------------------

export function explorerFiltersFromParams(params: Readable): SubjectFilters {
  return {
    ...NO_SUBJECT_FILTERS,
    search: params.get("q") ?? "",
    department: department(params),
    credits: credits(params),
    hasMonitors: flag(params, "monitores"),
    term: term(params),
  };
}

export function paramsFromExplorerFilters(filters: SubjectFilters): URLSearchParams {
  return build([
    ["q", filters.search.trim()],
    ["departamento", filters.department],
    ["creditos", filters.credits],
    ["monitores", filters.hasMonitors],
    ["periodo", filters.term],
  ]);
}

export function hasExplorerFilters(filters: SubjectFilters): boolean {
  return (
    filters.search.trim() !== "" ||
    filters.department !== null ||
    filters.credits !== null ||
    filters.hasMonitors
  );
}

// --- Administration --------------------------------------------------------------------------

export function subjectAdminFiltersFromParams(params: Readable): SubjectFilters {
  return {
    ...NO_SUBJECT_FILTERS,
    search: params.get("q") ?? "",
    department: department(params),
    active: status(params),
    term: term(params),
  };
}

export function paramsFromSubjectAdminFilters(filters: SubjectFilters): URLSearchParams {
  return build([
    ["vista", "asignaturas"],
    ["q", filters.search.trim()],
    ["departamento", filters.department],
    ["estado", filters.active === null ? null : filters.active ? "activas" : "inactivas"],
    ["periodo", filters.term],
  ]);
}

export function courseFiltersFromParams(params: Readable): CourseFilters {
  return {
    ...NO_COURSE_FILTERS,
    search: params.get("q") ?? "",
    term: term(params),
    department: department(params),
    withoutTeacher: flag(params, "sin-docente"),
    withoutMonitors: flag(params, "sin-monitores"),
  };
}

export function paramsFromCourseFilters(filters: CourseFilters): URLSearchParams {
  return build([
    ["vista", "cursos"],
    ["q", filters.search.trim()],
    ["periodo", filters.term],
    ["departamento", filters.department],
    ["sin-docente", filters.withoutTeacher],
    ["sin-monitores", filters.withoutMonitors],
  ]);
}

export function assignmentFiltersFromParams(params: Readable): AssignmentFilters {
  return { ...NO_ASSIGNMENT_FILTERS, search: params.get("q") ?? "", term: term(params) };
}

export function paramsFromAssignmentFilters(filters: AssignmentFilters): URLSearchParams {
  return build([
    ["vista", "monitores"],
    ["q", filters.search.trim()],
    ["periodo", filters.term],
  ]);
}

/** Whether two filter objects hold the same values (they are flat). */
export function sameFilters<F extends object>(a: F, b: F): boolean {
  return (Object.keys(a) as (keyof F)[]).every((key) => a[key] === b[key]);
}
