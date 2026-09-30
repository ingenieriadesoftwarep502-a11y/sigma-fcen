import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { forgetCsrfToken } from "@/lib/api-client";
import {
  createAssignment,
  createCourse,
  createDepartment,
  createSubject,
  createTerm,
  deleteAssignment,
  getCatalogSummary,
  getCurrentTerm,
  getSubject,
  isTermCode,
  listAllDepartments,
  listAllTerms,
  listAssignments,
  listCourses,
  listMyAssignments,
  listMyCourses,
  listSubjects,
  NO_ASSIGNMENT_FILTERS,
  NO_COURSE_FILTERS,
  NO_SUBJECT_FILTERS,
  updateCourse,
  updateDepartment,
  updateSubject,
} from "@/lib/catalog";

const BASE_URL = "http://api.test/api/v1";
const CSRF_URL = `${BASE_URL}/auth/csrf/`;
const EMPTY_PAGE = { count: 0, next: null, previous: null, results: [] };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("catalog API (FASE-02)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  function respond(body: unknown, status = 200) {
    fetchMock.mockImplementation((url) =>
      Promise.resolve(
        url === CSRF_URL ? jsonResponse({ csrfToken: "token" }) : jsonResponse(body, status),
      ),
    );
  }

  /** URL, method and JSON body of the only non-CSRF call. */
  function onlyRequest(): { url: string; method: string; body: unknown } {
    const calls = fetchMock.mock.calls.filter(([url]) => url !== CSRF_URL);
    expect(calls).toHaveLength(1);
    const [url, init] = calls[0]!;
    return {
      url: String(url),
      method: init?.method ?? "GET",
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    };
  }

  beforeEach(() => {
    forgetCsrfToken();
    vi.stubEnv("NEXT_PUBLIC_API_URL", BASE_URL);
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("lists subjects with only the filters in use", async () => {
    respond(EMPTY_PAGE);
    await listSubjects(2, {
      ...NO_SUBJECT_FILTERS,
      search: "  cálculo ",
      department: "MAT",
      credits: 4,
      hasMonitors: true,
      term: "2026-1",
    });

    const url = new URL(onlyRequest().url);
    expect(url.pathname).toBe("/api/v1/subjects/");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: "2",
      search: "cálculo",
      department: "MAT",
      credits: "4",
      has_monitors: "true",
      term: "2026-1",
    });
  });

  it("sends the admin status filter as a strict boolean", async () => {
    respond(EMPTY_PAGE);
    await listSubjects(1, { ...NO_SUBJECT_FILTERS, active: false });

    expect(new URL(onlyRequest().url).searchParams.get("active")).toBe("false");
  });

  it("reads one subject for a term", async () => {
    respond({ id: 7 });
    await getSubject(7, "2026-2");

    expect(onlyRequest().url).toBe(`${BASE_URL}/subjects/7/?term=2026-2`);
  });

  it("creates and edits subjects", async () => {
    respond({ id: 1 }, 201);
    await createSubject({ code: "MAT-101", name: "Cálculo", credits: 4, department: 3 });
    expect(onlyRequest()).toMatchObject({
      url: `${BASE_URL}/subjects/`,
      method: "POST",
      body: { code: "MAT-101", name: "Cálculo", credits: 4, department: 3 },
    });

    fetchMock.mockClear();
    await updateSubject(1, { is_active: false });
    expect(onlyRequest()).toMatchObject({
      url: `${BASE_URL}/subjects/1/`,
      method: "PATCH",
      body: { is_active: false },
    });
  });

  it("loads every department and every term in one page", async () => {
    respond(EMPTY_PAGE);
    await listAllDepartments();
    expect(onlyRequest().url).toBe(`${BASE_URL}/departments/?page_size=100`);

    fetchMock.mockClear();
    await listAllTerms();
    expect(onlyRequest().url).toBe(`${BASE_URL}/terms/?page_size=100`);
  });

  it("creates and edits departments", async () => {
    respond({ id: 1 }, 201);
    await createDepartment({ code: "MAT", name: "Matemáticas" });
    expect(onlyRequest()).toMatchObject({ url: `${BASE_URL}/departments/`, method: "POST" });

    fetchMock.mockClear();
    await updateDepartment(1, { is_active: false });
    expect(onlyRequest()).toMatchObject({
      url: `${BASE_URL}/departments/1/`,
      method: "PATCH",
      body: { is_active: false },
    });
  });

  it("returns null when there is no current term", async () => {
    respond({ detail: "No hay períodos académicos registrados." }, 404);

    await expect(getCurrentTerm()).resolves.toBeNull();
  });

  it("returns the current term", async () => {
    const term = { id: 1, code: "2026-2", start_date: "2026-08-01", end_date: "2026-12-01" };
    respond(term);

    await expect(getCurrentTerm()).resolves.toEqual(term);
  });

  it("creates a term", async () => {
    respond({ id: 2 }, 201);
    await createTerm({ code: "2027-1", start_date: "2027-02-01", end_date: "2027-06-15" });

    expect(onlyRequest()).toMatchObject({ url: `${BASE_URL}/terms/`, method: "POST" });
  });

  it("lists courses with the coverage toggles", async () => {
    respond(EMPTY_PAGE);
    await listCourses(1, {
      ...NO_COURSE_FILTERS,
      withoutTeacher: true,
      withoutMonitors: true,
      department: "3",
    });

    expect(Object.fromEntries(new URL(onlyRequest().url).searchParams)).toEqual({
      page: "1",
      department: "3",
      without_teacher: "true",
      without_monitors: "true",
    });
  });

  it("creates and edits courses", async () => {
    respond({ id: 5 }, 201);
    await createCourse({ subject: 1, term: "2026-2", group: "1", teacher: null });
    expect(onlyRequest()).toMatchObject({ url: `${BASE_URL}/courses/`, method: "POST" });

    fetchMock.mockClear();
    await updateCourse(5, { teacher: null });
    expect(onlyRequest()).toMatchObject({
      url: `${BASE_URL}/courses/5/`,
      method: "PATCH",
      body: { teacher: null },
    });
  });

  it("lists the teacher's own courses of a term", async () => {
    respond(EMPTY_PAGE);
    await listMyCourses("2026-1");

    expect(onlyRequest().url).toBe(`${BASE_URL}/courses/mine/?page_size=100&term=2026-1`);
  });

  it("lists the monitor's own assignments of a term", async () => {
    respond(EMPTY_PAGE);
    await listMyAssignments("2026-1");
    expect(onlyRequest().url).toBe(
      `${BASE_URL}/monitor-assignments/mine/?page_size=100&term=2026-1`,
    );

    fetchMock.mockClear();
    await listMyAssignments(null);
    expect(onlyRequest().url).toBe(`${BASE_URL}/monitor-assignments/mine/?page_size=100`);
  });

  it("lists, creates and withdraws monitor assignments", async () => {
    respond(EMPTY_PAGE);
    await listAssignments(1, { ...NO_ASSIGNMENT_FILTERS, search: "ana", term: "2026-2" });
    expect(onlyRequest().url).toBe(
      `${BASE_URL}/monitor-assignments/?page=1&search=ana&term=2026-2`,
    );

    fetchMock.mockClear();
    respond({ id: 9 }, 201);
    await createAssignment({ monitor: "u-1", subject: 2, term: "2026-2", committed_hours: 6 });
    expect(onlyRequest()).toMatchObject({
      url: `${BASE_URL}/monitor-assignments/`,
      method: "POST",
      body: { monitor: "u-1", subject: 2, term: "2026-2", committed_hours: 6 },
    });

    fetchMock.mockClear();
    respond(null, 204);
    await deleteAssignment(9);
    expect(onlyRequest()).toMatchObject({
      url: `${BASE_URL}/monitor-assignments/9/`,
      method: "DELETE",
    });
  });

  it("reads the catalog summary of the current term by default", async () => {
    respond({});
    await getCatalogSummary();

    expect(onlyRequest().url).toBe(`${BASE_URL}/catalog/summary/`);
  });

  it("validates term codes like the API", () => {
    expect(isTermCode("2026-1")).toBe(true);
    expect(isTermCode("2026-2")).toBe(true);
    expect(isTermCode("2026-3")).toBe(false);
    expect(isTermCode("26-1")).toBe(false);
    expect(isTermCode(" 2026-1")).toBe(false);
  });
});
