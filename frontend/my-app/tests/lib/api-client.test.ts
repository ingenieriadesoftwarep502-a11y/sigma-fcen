import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiRequest, getApiBaseUrl } from "@/lib/api-client";

const BASE_URL = "http://api.test/api/v1";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("getApiBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads NEXT_PUBLIC_API_URL and drops the trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", `${BASE_URL}/`);

    expect(getApiBaseUrl()).toBe(BASE_URL);
  });

  it("fails with a clear message when NEXT_PUBLIC_API_URL is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");

    expect(() => getApiBaseUrl()).toThrow(/NEXT_PUBLIC_API_URL/);
  });
});

describe("apiRequest", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", BASE_URL);
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns the parsed JSON body of a successful response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: "ok", database: "ok" }));

    const body = await apiRequest<{ status: string; database: string }>("/health/");

    expect(body).toEqual({ status: "ok", database: "ok" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/health/`);
    expect(init?.credentials).toBe("include");
    expect(new Headers(init?.headers).get("Accept")).toBe("application/json");
  });

  it("serializes the body as JSON and sets the content type", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 1 }, 201));

    await apiRequest("/items/", { method: "POST", body: { name: "x" } });

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ name: "x" }));
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
  });

  it("returns undefined for 204 No Content", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(apiRequest("/items/1/", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("throws a typed ApiError with status and body on HTTP errors", async () => {
    const problem = { type: "not_authenticated", status: 403, detail: "Authentication required." };
    fetchMock.mockResolvedValue(jsonResponse(problem, 403));

    const error = await apiRequest("/private/").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, body: problem, message: "Authentication required." });
  });

  it("throws an ApiError with status 0 when the network fails", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const error = await apiRequest("/health/").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0 });
  });

  it("rejects paths that do not start with a slash", async () => {
    await expect(apiRequest("health/")).rejects.toThrow(/must start with "\/"/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
