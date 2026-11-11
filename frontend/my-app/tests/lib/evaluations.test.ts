import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { forgetCsrfToken } from "@/lib/api-client";
import {
  canEvaluate,
  countPendingEvaluations,
  getMonitorRating,
  listMyEvaluations,
  ratingLabel,
  submitEvaluation,
} from "@/lib/evaluations";

import { historyItem } from "../features/sessions/fixtures";

const BASE_URL = "http://api.test/api/v1";
const CSRF_URL = `${BASE_URL}/auth/csrf/`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("evaluations API (FASE-06)", () => {
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

  it("sends the session, the rating and the trimmed comment", async () => {
    respond({ id: "e-1" }, 201);

    await submitEvaluation({ session_id: "t-1", rating: 4, comment: "  Muy clara.  " });

    expect(onlyRequest()).toEqual({
      url: `${BASE_URL}/evaluations/`,
      method: "POST",
      body: { session_id: "t-1", rating: 4, comment: "Muy clara." },
    });
  });

  it("leaves out a blank comment", async () => {
    respond({ id: "e-1" }, 201);

    await submitEvaluation({ session_id: "t-1", rating: 5, comment: "   " });

    expect(onlyRequest().body).toEqual({ session_id: "t-1", rating: 5 });
  });

  it("reads the student's evaluations, the pending count and a monitor's rating", async () => {
    respond({ count: 3, next: null, previous: null, results: [] });
    await listMyEvaluations(2);
    expect(onlyRequest().url).toBe(`${BASE_URL}/evaluations/mine/?page=2`);

    fetchMock.mockClear();
    expect(await countPendingEvaluations()).toBe(3);
    expect(onlyRequest().url).toBe(
      `${BASE_URL}/tutoring-sessions/pending-evaluation/?page=1&page_size=1`,
    );

    fetchMock.mockClear();
    respond({ published: false });
    await getMonitorRating("m-1");
    expect(onlyRequest().url).toBe(`${BASE_URL}/monitors/m-1/rating/`);
  });
});

describe("canEvaluate (RN-007.1, RN-007.3)", () => {
  it("is true only for an attended session not evaluated yet", () => {
    expect(canEvaluate(historyItem())).toBe(true);
    expect(canEvaluate(historyItem({ status: "NO_SHOW" }))).toBe(false);
    expect(canEvaluate(historyItem({ session: null }))).toBe(false);
    expect(
      canEvaluate(
        historyItem({
          evaluation: { id: "e-1", rating: 5, comment: "", created_at: new Date().toISOString() },
        }),
      ),
    ).toBe(false);
  });
});

describe("ratingLabel", () => {
  it("writes the rating on the 1 to 5 scale with a decimal comma", () => {
    expect(ratingLabel(4)).toBe("4 de 5");
    expect(ratingLabel(3.67)).toBe("3,67 de 5");
    expect(ratingLabel(4.5)).toBe("4,5 de 5");
  });
});
