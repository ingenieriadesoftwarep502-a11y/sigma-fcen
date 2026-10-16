import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { forgetCsrfToken } from "@/lib/api-client";
import {
  bogotaDateTime,
  cancelSlot,
  createSlot,
  createTemplate,
  deactivateTemplate,
  HALF_HOURS,
  isGroupSession,
  listMySlots,
  listMyTemplates,
  NO_MY_SLOT_FILTERS,
  NO_SLOT_SEARCH_FILTERS,
  searchSlots,
  toBogotaIso,
  updateSlot,
} from "@/lib/availability";

const BASE_URL = "http://api.test/api/v1";
const CSRF_URL = `${BASE_URL}/auth/csrf/`;
const EMPTY_PAGE = { count: 0, next: null, previous: null, results: [] };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("availability API (FASE-03)", () => {
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

  it("lists the monitor's own slots with only the filters in use", async () => {
    respond(EMPTY_PAGE);
    await listMySlots(1, NO_MY_SLOT_FILTERS);
    expect(onlyRequest().url).toBe(`${BASE_URL}/availability-slots/mine/?page=1`);

    fetchMock.mockClear();
    await listMySlots(2, { term: "2026-2", status: "AVAILABLE" });
    const url = new URL(onlyRequest().url);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: "2",
      term: "2026-2",
      status: "AVAILABLE",
    });
  });

  it("publishes, edits and withdraws a slot", async () => {
    respond({ id: 9 }, 201);
    await createSlot({
      subject: 1,
      starts_at: "2026-10-20T10:00:00-05:00",
      modality: "IN_PERSON",
      location: "Bloque 14-203",
      capacity: 4,
    });
    expect(onlyRequest()).toMatchObject({
      url: `${BASE_URL}/availability-slots/`,
      method: "POST",
      body: {
        subject: 1,
        starts_at: "2026-10-20T10:00:00-05:00",
        modality: "IN_PERSON",
        location: "Bloque 14-203",
        capacity: 4,
      },
    });

    fetchMock.mockClear();
    respond({ id: 9 });
    await updateSlot(9, { location: "Bloque 14-204" });
    expect(onlyRequest()).toMatchObject({
      url: `${BASE_URL}/availability-slots/9/`,
      method: "PATCH",
      body: { location: "Bloque 14-204" },
    });

    fetchMock.mockClear();
    respond(null, 204);
    await cancelSlot(9);
    expect(onlyRequest()).toMatchObject({
      url: `${BASE_URL}/availability-slots/9/`,
      method: "DELETE",
    });
  });

  it("lists, creates and deactivates weekly templates", async () => {
    respond(EMPTY_PAGE);
    await listMyTemplates(1, { term: "2026-2" });
    expect(onlyRequest().url).toBe(`${BASE_URL}/slot-templates/mine/?page=1&term=2026-2`);

    fetchMock.mockClear();
    respond({ id: 3 }, 201);
    await createTemplate({
      subject: 1,
      term: "2026-2",
      weekday: 1,
      start_time: "10:00",
      modality: "VIRTUAL",
      location: "https://meet.example.org/abc",
      capacity: 1,
    });
    expect(onlyRequest()).toMatchObject({
      url: `${BASE_URL}/slot-templates/`,
      method: "POST",
      body: { weekday: 1, start_time: "10:00", term: "2026-2" },
    });

    fetchMock.mockClear();
    respond(null, 204);
    await deactivateTemplate(3);
    expect(onlyRequest()).toMatchObject({ url: `${BASE_URL}/slot-templates/3/`, method: "DELETE" });
  });

  it("searches bookable slots with the combined filters", async () => {
    respond(EMPTY_PAGE);
    await searchSlots(1, NO_SLOT_SEARCH_FILTERS);
    expect(onlyRequest().url).toBe(`${BASE_URL}/availability-slots/search/?page=1`);

    fetchMock.mockClear();
    await searchSlots(3, {
      subject: { id: 1, code: "MAT-101", name: "Cálculo diferencial" },
      monitor: { id: "m-1", name: "Ana Pérez" },
      modality: "VIRTUAL",
      dateFrom: "2026-10-19",
      dateTo: "2026-10-25",
    });
    expect(Object.fromEntries(new URL(onlyRequest().url).searchParams)).toEqual({
      page: "3",
      subject: "1",
      monitor: "m-1",
      modality: "VIRTUAL",
      date_from: "2026-10-19",
      date_to: "2026-10-25",
    });
  });
});

describe("availability time helpers", () => {
  it("builds an ISO start in Bogotá time, which has no daylight saving", () => {
    expect(toBogotaIso("2026-10-20", "07:30")).toBe("2026-10-20T07:30:00-05:00");
  });

  it("reads a UTC instant back as a Bogotá date and time", () => {
    expect(bogotaDateTime("2026-10-20T15:30:00Z")).toEqual({ date: "2026-10-20", time: "10:30" });
    expect(bogotaDateTime("2026-10-21T02:00:00Z")).toEqual({ date: "2026-10-20", time: "21:00" });
  });

  it("offers starts on the hour or on the half hour only", () => {
    expect(HALF_HOURS).toHaveLength(48);
    expect(HALF_HOURS[0]).toBe("00:00");
    expect(HALF_HOURS[21]).toBe("10:30");
    expect(HALF_HOURS.every((time) => /^\d{2}:(00|30)$/.test(time))).toBe(true);
  });

  it("calls a session with more than one seat a group session", () => {
    expect(isGroupSession(1)).toBe(false);
    expect(isGroupSession(2)).toBe(true);
  });
});
