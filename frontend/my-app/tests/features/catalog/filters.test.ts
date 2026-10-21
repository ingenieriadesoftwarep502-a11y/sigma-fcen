import { describe, expect, it } from "vitest";

import {
  assignmentFiltersFromParams,
  courseFiltersFromParams,
  explorerFiltersFromParams,
  paramsFromAssignmentFilters,
  paramsFromCourseFilters,
  paramsFromExplorerFilters,
  paramsFromSubjectAdminFilters,
  subjectAdminFiltersFromParams,
  viewFromParams,
} from "@/features/catalog/filters";
import {
  NO_ASSIGNMENT_FILTERS,
  NO_COURSE_FILTERS,
  NO_SUBJECT_FILTERS,
} from "@/lib/catalog";

describe("catalog filters in the URL", () => {
  it("round-trips the explorer filters with Spanish parameter names", () => {
    const filters = {
      ...NO_SUBJECT_FILTERS,
      search: "cálculo",
      department: "MAT",
      credits: 4,
      hasMonitors: true,
      term: "2026-1",
    };
    const params = paramsFromExplorerFilters(filters);

    expect(params.toString()).toBe(
      "q=c%C3%A1lculo&departamento=MAT&creditos=4&monitores=1&periodo=2026-1",
    );
    expect(explorerFiltersFromParams(params)).toEqual(filters);
  });

  it("ignores malformed explorer parameters", () => {
    const params = new URLSearchParams("creditos=cuatro&periodo=2026-9&monitores=si&estado=inactivas");

    expect(explorerFiltersFromParams(params)).toEqual(NO_SUBJECT_FILTERS);
  });

  it("keeps the admin subject status and the view", () => {
    const filters = { ...NO_SUBJECT_FILTERS, active: false, department: "FIS" };
    const params = paramsFromSubjectAdminFilters(filters);

    expect(params.toString()).toBe("vista=asignaturas&departamento=FIS&estado=inactivas");
    expect(subjectAdminFiltersFromParams(params)).toEqual(filters);
  });

  it("round-trips course filters with the coverage toggles", () => {
    const filters = {
      ...NO_COURSE_FILTERS,
      search: "ana",
      term: "2026-2",
      withoutTeacher: true,
      withoutMonitors: true,
    };
    const params = paramsFromCourseFilters(filters);

    expect(params.toString()).toBe(
      "vista=cursos&q=ana&periodo=2026-2&sin-docente=1&sin-monitores=1",
    );
    expect(courseFiltersFromParams(params)).toEqual(filters);
  });

  it("round-trips assignment filters", () => {
    const filters = { ...NO_ASSIGNMENT_FILTERS, search: "luis", term: "2026-1" };
    const params = paramsFromAssignmentFilters(filters);

    expect(params.toString()).toBe("vista=monitores&q=luis&periodo=2026-1");
    expect(assignmentFiltersFromParams(params)).toEqual(filters);
  });

  it("reads the admin view, defaulting to subjects", () => {
    expect(viewFromParams(new URLSearchParams("vista=cursos"))).toBe("cursos");
    expect(viewFromParams(new URLSearchParams("vista=organizacion"))).toBe("organizacion");
    expect(viewFromParams(new URLSearchParams("vista=otra"))).toBe("asignaturas");
    expect(viewFromParams(new URLSearchParams())).toBe("asignaturas");
  });
});
