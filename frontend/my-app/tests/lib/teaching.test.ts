import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  dateRangeError,
  getTeachingCourse,
  listCourseMonitors,
  listCourseSessions,
  listCourseStudents,
  listFrequentTopics,
  listTeachingCourses,
  NO_SESSION_DATES,
  SESSIONS_PAGE_SIZE,
  TOP_TOPICS,
} from "@/lib/teaching";

const BASE_URL = "http://api.test/api/v1";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const PAGE = { count: 1, next: null, previous: null, results: [{ id: 1 }] };

describe("teacher follow-up API (FASE-08)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  function requestedUrls(): string[] {
    return fetchMock.mock.calls.map(([url]) => String(url));
  }

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", BASE_URL);
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(PAGE)));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("lists the teacher's courses of a term, or of the current one", async () => {
    expect(await listTeachingCourses("2026-1")).toEqual(PAGE.results);
    await listTeachingCourses(null);

    expect(requestedUrls()).toEqual([
      `${BASE_URL}/teaching/courses/?term=2026-1&page_size=100`,
      `${BASE_URL}/teaching/courses/?page_size=100`,
    ]);
  });

  it("reads one course with its indicators", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 7 }));

    expect(await getTeachingCourse(7)).toEqual({ id: 7 });
    expect(requestedUrls()).toEqual([`${BASE_URL}/teaching/courses/7/`]);
  });

  it("always sends the course to the server, which applies the filter", async () => {
    await listCourseMonitors(7);
    await listCourseStudents(7);
    await listFrequentTopics(7);

    expect(requestedUrls()).toEqual([
      `${BASE_URL}/teaching/monitors/?course=7&page_size=100`,
      `${BASE_URL}/teaching/students/?course=7&page_size=100`,
      `${BASE_URL}/teaching/frequent-topics/?course=7&page_size=${TOP_TOPICS}`,
    ]);
  });

  it("pages the course sessions and filters them by date", async () => {
    await listCourseSessions(2, { course: 7, ...NO_SESSION_DATES });
    await listCourseSessions(1, { course: 7, dateFrom: "2026-09-01", dateTo: "2026-09-30" });

    expect(requestedUrls()).toEqual([
      `${BASE_URL}/teaching/sessions/?course=7&page=2&page_size=${SESSIONS_PAGE_SIZE}`,
      `${BASE_URL}/teaching/sessions/?course=7&date_from=2026-09-01&date_to=2026-09-30&page=1&page_size=${SESSIONS_PAGE_SIZE}`,
    ]);
  });
});

describe("dateRangeError", () => {
  it("accepts open, single-day and ordered ranges", () => {
    expect(dateRangeError(null, null)).toBeNull();
    expect(dateRangeError("2026-09-01", null)).toBeNull();
    expect(dateRangeError("2026-09-01", "2026-09-01")).toBeNull();
    expect(dateRangeError("2026-09-01", "2026-09-30")).toBeNull();
  });

  it("rejects a range that ends before it starts, with the API's message", () => {
    expect(dateRangeError("2026-09-02", "2026-09-01")).toBe(
      "La fecha final no puede ser anterior a la inicial.",
    );
  });
});
