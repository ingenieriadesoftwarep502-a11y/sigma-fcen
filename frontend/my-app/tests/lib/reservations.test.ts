import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, forgetCsrfToken } from "@/lib/api-client";
import {
  cancelReservation,
  CANCEL_WINDOW_HOURS,
  cancelsAsNoShow,
  hasStarted,
  isReservationConflict,
  listMyReservations,
  MAX_NOTE_LENGTH,
  NO_RESERVATION_FILTERS,
  reserveSlot,
} from "@/lib/reservations";

const BASE_URL = "http://api.test/api/v1";
const CSRF_URL = `${BASE_URL}/auth/csrf/`;
const EMPTY_PAGE = { count: 0, next: null, previous: null, results: [] };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("reservations API (FASE-04)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  function respond(body: unknown, status = 200) {
    fetchMock.mockImplementation((url) =>
      Promise.resolve(
        url === CSRF_URL ? jsonResponse({ csrfToken: "token" }) : jsonResponse(body, status),
      ),
    );
  }

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

  it("reserves a slot sending only its id: the student is the signed-in user", async () => {
    respond({ id: "r-1" }, 201);

    await reserveSlot(21);

    expect(onlyRequest()).toEqual({
      url: `${BASE_URL}/reservations/`,
      method: "POST",
      body: { slot_id: 21 },
    });
  });

  it("sends the optional note trimmed, and leaves a blank one out (RF-047)", async () => {
    respond({ id: "r-1" }, 201);
    await reserveSlot(21, "  Repasar derivadas  ");
    expect(onlyRequest().body).toEqual({ slot_id: 21, note: "Repasar derivadas" });

    fetchMock.mockClear();
    await reserveSlot(21, "   ");
    expect(onlyRequest().body).toEqual({ slot_id: 21 });
    expect(MAX_NOTE_LENGTH).toBe(500);
  });

  it("lists the user's reservations with only the filters in use", async () => {
    respond(EMPTY_PAGE);
    await listMyReservations(1, NO_RESERVATION_FILTERS);
    expect(onlyRequest().url).toBe(`${BASE_URL}/reservations/mine/?page=1`);

    fetchMock.mockClear();
    await listMyReservations(2, { role: "monitor", when: "upcoming", status: "CONFIRMED" });
    const url = new URL(onlyRequest().url);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: "2",
      role: "monitor",
      when: "upcoming",
      status: "CONFIRMED",
    });
  });

  it("cancels with an optional reason", async () => {
    respond({ id: "r-1" });
    await cancelReservation("r-1");
    expect(onlyRequest()).toEqual({
      url: `${BASE_URL}/reservations/r-1/cancel/`,
      method: "POST",
      body: {},
    });

    fetchMock.mockClear();
    await cancelReservation("r-1", "Calamidad");
    expect(onlyRequest().body).toEqual({ reason: "Calamidad" });
  });

  it("recognizes the 409 of a slot someone else just took", async () => {
    respond(
      {
        type: "slot_unavailable",
        title: "Conflicto",
        status: 409,
        detail: "La franja ya no está disponible.",
        instance: "/api/v1/reservations/",
      },
      409,
    );

    const error = await reserveSlot(21).catch((caught: unknown) => caught);

    expect(isReservationConflict(error)).toBe(true);
    expect((error as ApiError).message).toBe("La franja ya no está disponible.");
    expect(isReservationConflict(new ApiError(400, "x"))).toBe(false);
    expect(isReservationConflict(new Error("x"))).toBe(false);
  });
});

describe("cancellation window (ADR-011)", () => {
  const NOW = new Date("2026-10-19T15:00:00Z");
  const hoursAhead = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000).toISOString();

  it("is four hours before the start", () => {
    expect(CANCEL_WINDOW_HOURS).toBe(4);
    expect(cancelsAsNoShow(hoursAhead(4), NOW)).toBe(false);
    expect(cancelsAsNoShow(hoursAhead(48), NOW)).toBe(false);
    expect(cancelsAsNoShow(hoursAhead(3.9), NOW)).toBe(true);
  });

  it("closes once the session started", () => {
    expect(hasStarted(hoursAhead(0.1), NOW)).toBe(false);
    expect(hasStarted(hoursAhead(0), NOW)).toBe(true);
    expect(hasStarted(hoursAhead(-1), NOW)).toBe(true);
  });
});
