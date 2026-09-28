import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  apiRequest,
  fieldErrors,
  getApiBaseUrl,
  requestErrorMessage,
} from "@/lib/api-client";

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
    document.cookie = "csrftoken=test-token; path=/";
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    document.cookie = "csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
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

    describe("without a csrftoken cookie", () => {
      const CSRF_URL = `${BASE_URL}/auth/csrf/`;

      beforeEach(() => {
        document.cookie = "csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
      });

      /** The csrf endpoint sets the cookie, as Django does; anything else succeeds. */
      function serveCsrfCookie(url: RequestInfo | URL): Promise<Response> {
        if (url === CSRF_URL) {
          document.cookie = "csrftoken=fresh-token; path=/";
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        return Promise.resolve(jsonResponse({}));
      }

      it("fetches the csrf cookie before an unsafe request and then sends it", async () => {
        fetchMock.mockImplementation(serveCsrfCookie);

        await apiRequest("/auth/login/", { method: "POST", body: {} });

        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
          CSRF_URL,
          `${BASE_URL}/auth/login/`,
        ]);
        const [, csrfInit] = fetchMock.mock.calls[0];
        expect(csrfInit?.method ?? "GET").toBe("GET");
        expect(csrfInit?.credentials).toBe("include");
        const [, loginInit] = fetchMock.mock.calls[1];
        expect(new Headers(loginInit?.headers).get("X-CSRFToken")).toBe("fresh-token");
      });

      it("shares one csrf fetch between concurrent unsafe requests", async () => {
        let resolveCsrf: () => void = () => {};
        fetchMock.mockImplementation((url) => {
          if (url === CSRF_URL) {
            return new Promise<Response>((resolve) => {
              resolveCsrf = () => {
                document.cookie = "csrftoken=fresh-token; path=/";
                resolve(new Response(null, { status: 204 }));
              };
            });
          }
          return Promise.resolve(jsonResponse({}));
        });

        const requests = Promise.all([
          apiRequest("/a/", { method: "POST", body: {} }),
          apiRequest("/b/", { method: "POST", body: {} }),
        ]);
        await vi.waitFor(() =>
          expect(fetchMock.mock.calls.filter(([u]) => u === CSRF_URL)).toHaveLength(1),
        );
        resolveCsrf();
        await requests;

        expect(fetchMock.mock.calls.filter(([u]) => u === CSRF_URL)).toHaveLength(1);
        for (const [, init] of fetchMock.mock.calls.slice(1)) {
          expect(new Headers(init?.headers).get("X-CSRFToken")).toBe("fresh-token");
        }
      });

      it("does not fetch the csrf cookie for safe methods", async () => {
        fetchMock.mockImplementation(serveCsrfCookie);

        await apiRequest("/items/");

        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([`${BASE_URL}/items/`]);
      });
    });

    it("does not fetch the csrf cookie when it is already present", async () => {
      fetchMock.mockResolvedValue(jsonResponse({}));

      await apiRequest("/auth/login/", { method: "POST", body: {} });

      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([`${BASE_URL}/auth/login/`]);
    });

    it("always includes credentials so the auth cookies travel", async () => {
      fetchMock.mockResolvedValue(jsonResponse({}));

      await apiRequest("/items/", { credentials: "omit" });

      const [, init] = fetchMock.mock.calls[0];
      expect(init?.credentials).toBe("include");
    });
  });

  describe("session refresh on 401", () => {
    const REFRESH_URL = `${BASE_URL}/auth/refresh/`;
    const expired = { detail: "Given token not valid for any token type" };

    function callsTo(url: string) {
      return fetchMock.mock.calls.filter(([calledUrl]) => calledUrl === url);
    }

    it("refreshes the session once and retries the original request", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(expired, 401))
        .mockResolvedValueOnce(jsonResponse({ detail: "ok" }))
        .mockResolvedValueOnce(jsonResponse({ id: 1 }));

      const body = await apiRequest("/items/1/");

      expect(body).toEqual({ id: 1 });
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        `${BASE_URL}/items/1/`,
        REFRESH_URL,
        `${BASE_URL}/items/1/`,
      ]);
      const [, refreshInit] = fetchMock.mock.calls[1];
      expect(refreshInit?.method).toBe("POST");
      expect(refreshInit?.credentials).toBe("include");
    });

    it("shares one refresh between concurrent 401 responses", async () => {
      let resolveRefresh: (response: Response) => void = () => {};
      fetchMock.mockImplementation((url) => {
        if (url === REFRESH_URL) {
          return new Promise<Response>((resolve) => {
            resolveRefresh = resolve;
          });
        }
        const isRetry = fetchMock.mock.calls.filter(([u]) => u === url).length > 1;
        return Promise.resolve(isRetry ? jsonResponse({ url }) : jsonResponse(expired, 401));
      });

      const requests = Promise.all([apiRequest("/a/"), apiRequest("/b/")]);
      await vi.waitFor(() => expect(callsTo(REFRESH_URL)).toHaveLength(1));
      resolveRefresh(jsonResponse({ detail: "ok" }));

      await expect(requests).resolves.toEqual([
        { url: `${BASE_URL}/a/` },
        { url: `${BASE_URL}/b/` },
      ]);
      expect(callsTo(REFRESH_URL)).toHaveLength(1);
    });

    it("surfaces the original 401 when the refresh fails", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(expired, 401))
        .mockResolvedValueOnce(jsonResponse({ detail: "Token is blacklisted" }, 401));

      const error = await apiRequest("/items/1/").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 401, body: expired });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("retries only once when the retried request is still unauthorized", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(expired, 401))
        .mockResolvedValueOnce(jsonResponse({ detail: "ok" }))
        .mockResolvedValueOnce(jsonResponse(expired, 401));

      const error = await apiRequest("/items/1/").catch((e: unknown) => e);

      expect(error).toMatchObject({ status: 401 });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it.each(["/auth/login/", "/auth/register/", "/auth/refresh/"])(
      "does not try to refresh after a 401 from %s",
      async (path) => {
        fetchMock.mockResolvedValue(
          jsonResponse({ detail: "Correo o contraseña incorrectos." }, 401),
        );

        const error = await apiRequest(path, { method: "POST", body: {} }).catch((e: unknown) => e);

        expect(error).toMatchObject({ status: 401 });
        expect(fetchMock).toHaveBeenCalledTimes(1);
      },
    );
  });

  describe("timeout", () => {
    function hangUntilAborted(_url: RequestInfo | URL, init?: RequestInit) {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    }

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("aborts after 15 seconds by default with a timeout ApiError", async () => {
      fetchMock.mockImplementation(hangUntilAborted);

      const pending = apiRequest("/health/").catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(14_999);
      expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const error = await pending;

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 0 });
      expect(requestErrorMessage(error)).toBe(
        "El servidor tardó demasiado en responder. Intenta de nuevo.",
      );
    });

    it("accepts a custom timeout", async () => {
      fetchMock.mockImplementation(hangUntilAborted);

      const pending = apiRequest("/health/", { timeoutMs: 500 }).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(500);

      expect(await pending).toMatchObject({ status: 0 });
    });

    it("still honors the caller's own abort signal", async () => {
      fetchMock.mockImplementation(hangUntilAborted);
      const controller = new AbortController();

      const pending = apiRequest("/health/", { signal: controller.signal }).catch(
        (e: unknown) => e,
      );
      controller.abort();
      const error = await pending;

      expect(error).toMatchObject({ status: 0 });
      expect(requestErrorMessage(error)).toBe(
        "No pudimos conectar con el servidor. Intenta de nuevo.",
      );
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
