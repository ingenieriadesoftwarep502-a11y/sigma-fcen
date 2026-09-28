import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiRequest, fieldErrors, getApiBaseUrl } from "@/lib/api-client";

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

  describe("CSRF protection", () => {
    afterEach(() => {
      document.cookie = "csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    });

    it.each(["POST", "PUT", "PATCH", "DELETE"])(
      "sends the csrftoken cookie as X-CSRFToken on %s",
      async (method) => {
        document.cookie = "other=1; path=/";
        document.cookie = "csrftoken=abc%20123; path=/";
        fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

        await apiRequest("/items/1/", { method });

        const [, init] = fetchMock.mock.calls[0];
        expect(new Headers(init?.headers).get("X-CSRFToken")).toBe("abc 123");
        expect(init?.credentials).toBe("include");
      },
    );

    it("does not send X-CSRFToken on safe methods", async () => {
      document.cookie = "csrftoken=abc123; path=/";
      fetchMock.mockResolvedValue(jsonResponse({}));

      await apiRequest("/items/");

      const [, init] = fetchMock.mock.calls[0];
      expect(new Headers(init?.headers).has("X-CSRFToken")).toBe(false);
    });

    it("omits X-CSRFToken when there is no csrftoken cookie", async () => {
      fetchMock.mockResolvedValue(jsonResponse({}));

      await apiRequest("/items/", { method: "POST", body: {} });

      const [, init] = fetchMock.mock.calls[0];
      expect(new Headers(init?.headers).has("X-CSRFToken")).toBe(false);
    });

    it("always includes credentials so the auth cookies travel", async () => {
      fetchMock.mockResolvedValue(jsonResponse({}));

      await apiRequest("/items/", { credentials: "omit" });

      const [, init] = fetchMock.mock.calls[0];
      expect(init?.credentials).toBe("include");
    });
  });

  it("rejects paths that do not start with a slash", async () => {
    await expect(apiRequest("health/")).rejects.toThrow(/must start with "\/"/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fieldErrors", () => {
  it("returns the per-field messages of a DRF validation error", () => {
    const error = new ApiError(400, "Bad request", {
      email: ["Ya existe una cuenta con este correo."],
      password: ["This password is too short.", "This password is too common."],
    });

    expect(fieldErrors(error)).toEqual({
      email: ["Ya existe una cuenta con este correo."],
      password: ["This password is too short.", "This password is too common."],
    });
  });

  it("ignores non-list values such as detail", () => {
    const error = new ApiError(401, "Unauthorized", { detail: "Correo o contraseña incorrectos." });

    expect(fieldErrors(error)).toEqual({});
  });

  it("returns no field errors for anything that is not an ApiError", () => {
    expect(fieldErrors(new Error("boom"))).toEqual({});
  });
});
