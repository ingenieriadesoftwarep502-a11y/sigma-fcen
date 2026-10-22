import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { forgetCsrfToken } from "@/lib/api-client";
import type { Reservation } from "@/lib/reservations";
import {
  addTopic,
  EDIT_WINDOW_HOURS,
  groupPendingBySlot,
  isEditable,
  listHistory,
  listMySessions,
  listPendingSlots,
  listTopics,
  recordSession,
  type TutoringSession,
  updateSession,
} from "@/lib/sessions";

const BASE_URL = "http://api.test/api/v1";
const CSRF_URL = `${BASE_URL}/auth/csrf/`;
const EMPTY_PAGE = { count: 0, next: null, previous: null, results: [] };
const HOUR = 3_600_000;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function reservation(id: string, slotId: number, startsAt: string): Reservation {
  return {
    id,
    slot: {
      id: slotId,
      subject: { id: 1, code: "MAT-101", name: "Cálculo diferencial" },
      monitor: { id: "m-1", full_name: "Sofía Díaz" },
      term: "2026-2",
      starts_at: startsAt,
      ends_at: startsAt,
      capacity: 3,
      status: "AVAILABLE",
      modality: "IN_PERSON",
      location: "Bloque 14-203",
    },
    student: { id: `s-${id}`, full_name: `Estudiante ${id}` },
    status: "CONFIRMED",
    student_note: "",
    created_at: startsAt,
    cancelled_at: null,
    cancelled_by: null,
    cancellation_reason: "",
  };
}

describe("tutoring sessions API (FASE-05)", () => {
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

  it("records a session with the attendance of each reservation", async () => {
    respond({ id: "t-1" }, 201);

    await recordSession({
      slot_id: 21,
      attendance: [{ reservation_id: "r-1", attendance: "ATTENDED" }],
      topic_ids: ["topic-1"],
      material_ids: [],
      notes: "  Repasamos derivadas.  ",
    });

    expect(onlyRequest()).toEqual({
      url: `${BASE_URL}/tutoring-sessions/`,
      method: "POST",
      body: {
        slot_id: 21,
        attendance: [{ reservation_id: "r-1", attendance: "ATTENDED" }],
        topic_ids: ["topic-1"],
        material_ids: [],
        notes: "Repasamos derivadas.",
      },
    });
  });

  it("sends only the changed fields when correcting a session", async () => {
    respond({ id: "t-1" });

    await updateSession("t-1", { notes: " Corregido ", duration_minutes: 50 });

    expect(onlyRequest()).toEqual({
      url: `${BASE_URL}/tutoring-sessions/t-1/`,
      method: "PATCH",
      body: { notes: "Corregido", duration_minutes: 50 },
    });
  });

  it("lists the monitor's sessions and the student's history with their filters", async () => {
    respond(EMPTY_PAGE);
    await listMySessions(2, { subject: 4 });
    expect(onlyRequest().url).toBe(`${BASE_URL}/tutoring-sessions/mine/?page=2&subject=4`);

    fetchMock.mockClear();
    await listHistory(1, { status: "NO_SHOW", subject: null });
    expect(onlyRequest().url).toBe(`${BASE_URL}/tutoring-sessions/history/?page=1&status=NO_SHOW`);
  });

  it("reads a subject's topics and adds a new one by name", async () => {
    respond([]);
    await listTopics(4);
    expect(onlyRequest().url).toBe(`${BASE_URL}/topics/?subject=4`);

    fetchMock.mockClear();
    respond({ id: "topic-9", name: "Series" }, 201);
    const topic = await addTopic(4, "  Series ");
    expect(topic.name).toBe("Series");
    expect(onlyRequest()).toMatchObject({
      url: `${BASE_URL}/topics/`,
      method: "POST",
      body: { subject_id: 4, name: "Series" },
    });
  });

  it("asks for the confirmed reservations of the monitor's slots that already started", async () => {
    respond(EMPTY_PAGE);

    await listPendingSlots();

    expect(onlyRequest().url).toBe(
      `${BASE_URL}/reservations/mine/?role=monitor&status=CONFIRMED&when=past&page_size=100`,
    );
  });
});

describe("groupPendingBySlot", () => {
  it("groups the reservations of each slot, latest slot first", () => {
    const groups = groupPendingBySlot([
      reservation("a", 1, "2026-10-20T15:00:00Z"),
      reservation("b", 2, "2026-10-21T15:00:00Z"),
      reservation("c", 1, "2026-10-20T15:00:00Z"),
    ]);

    expect(groups.map((group) => [group.slot.id, group.reservations.map((r) => r.id)])).toEqual([
      [2, ["b"]],
      [1, ["a", "c"]],
    ]);
  });
});

describe("isEditable (RF-052)", () => {
  const now = new Date("2026-10-22T15:00:00Z");

  function session(editableUntil: Date): Pick<TutoringSession, "editable_until"> {
    return { editable_until: editableUntil.toISOString() };
  }

  it(`allows corrections during the ${EDIT_WINDOW_HOURS} hours after recording`, () => {
    expect(isEditable(session(new Date(now.getTime() + HOUR)), now)).toBe(true);
  });

  it("locks the session once the window closes", () => {
    expect(isEditable(session(now), now)).toBe(false);
    expect(isEditable(session(new Date(now.getTime() - HOUR)), now)).toBe(false);
  });
});
