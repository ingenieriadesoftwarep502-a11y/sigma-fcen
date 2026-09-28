import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { forgetCsrfToken } from "@/lib/api-client";
import {
  getCurrentUser,
  hasAnyRole,
  isInstitutionalEmail,
  login,
  logout,
  register,
  safeRedirectPath,
  type User,
} from "@/lib/auth";

const BASE_URL = "http://api.test/api/v1";
const CSRF_URL = `${BASE_URL}/auth/csrf/`;
const USER: User = {
  id: "3f0c2b1e-0000-4000-8000-000000000001",
  email: "ana.perez@unal.edu.co",
  first_name: "Ana",
  last_name: "Pérez",
  roles: ["STUDENT"],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("auth API", () => {
  const fetchMock = vi.fn<typeof fetch>();
  let issued = 0;

  /** Answers the CSRF request with a new token each time and `response` otherwise. */
  function respond(response: () => Response) {
    fetchMock.mockImplementation((url) => {
      if (url === CSRF_URL) {
        issued += 1;
        return Promise.resolve(jsonResponse({ csrfToken: `token-${issued}` }));
      }
      return Promise.resolve(response());
    });
  }

  function callsTo(path: string) {
    return fetchMock.mock.calls.filter(([url]) => url === `${BASE_URL}${path}`);
  }

  beforeEach(() => {
    issued = 0;
    forgetCsrfToken();
    vi.stubEnv("NEXT_PUBLIC_API_URL", BASE_URL);
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("logs in with email and password and returns the user", async () => {
    respond(() => jsonResponse(USER));

    const user = await login("ana.perez@unal.edu.co", "Str0ng-Passw0rd!");

    expect(user).toEqual(USER);
    const [[, init]] = callsTo("/auth/login/");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
    expect(new Headers(init?.headers).get("X-CSRFToken")).toBe("token-1");
    expect(JSON.parse(String(init?.body))).toEqual({
      email: "ana.perez@unal.edu.co",
      password: "Str0ng-Passw0rd!",
    });
  });

  it("asks for a new CSRF token after login, because the API rotates it", async () => {
    respond(() => jsonResponse(USER));
    await login("ana.perez@unal.edu.co", "Str0ng-Passw0rd!");

    respond(() => new Response(null, { status: 204 }));
    await logout();

    const [[, init]] = callsTo("/auth/logout/");
    expect(new Headers(init?.headers).get("X-CSRFToken")).toBe("token-2");
  });

  it("registers a new student account", async () => {
    respond(() => jsonResponse(USER, 201));
    const data = {
      email: "ana.perez@unal.edu.co",
      password: "Str0ng-Passw0rd!",
      first_name: "Ana",
      last_name: "Pérez",
    };

    const user = await register(data);

    expect(user).toEqual(USER);
    const [[, init]] = callsTo("/auth/register/");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual(data);
  });

  it("logs out so the API clears the session cookies", async () => {
    respond(() => new Response(null, { status: 204 }));

    await expect(logout()).resolves.toBeUndefined();

    const [[, init]] = callsTo("/auth/logout/");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
  });

  it("reads the signed-in user from /users/me/", async () => {
    respond(() => jsonResponse(USER));

    await expect(getCurrentUser()).resolves.toEqual(USER);
    expect(callsTo("/users/me/")).toHaveLength(1);
  });

  it("returns null when there is no session", async () => {
    respond(() => jsonResponse({ detail: "No autenticado." }, 401));

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("does not hide other failures as a missing session", async () => {
    respond(() => jsonResponse({ detail: "Error del servidor." }, 500));

    await expect(getCurrentUser()).rejects.toMatchObject({ status: 500 });
  });
});

describe("isInstitutionalEmail (RN-001.2)", () => {
  it.each(["ana.perez@unal.edu.co", "Ana.Perez@UNAL.EDU.CO"])("accepts %s", (email) => {
    expect(isInstitutionalEmail(email)).toBe(true);
  });

  it.each(["ana@gmail.com", "ana@fakeunal.edu.co", "ana@unal.edu.co.evil.com", "ana"])(
    "rejects %s",
    (email) => {
      expect(isInstitutionalEmail(email)).toBe(false);
    },
  );
});

describe("hasAnyRole", () => {
  it("accepts a user holding any of the roles", () => {
    expect(hasAnyRole({ ...USER, roles: ["STUDENT", "MONITOR"] }, ["MONITOR", "ADMIN"])).toBe(true);
  });

  it("rejects a user holding none of them", () => {
    expect(hasAnyRole(USER, ["ADMIN"])).toBe(false);
  });
});

describe("safeRedirectPath (no open redirects)", () => {
  it.each(["/inicio", "/usuarios?page=2", "/a/b#c"])("keeps the internal path %s", (path) => {
    expect(safeRedirectPath(path)).toBe(path);
  });

  it.each([
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "javascript:alert(1)",
    "inicio",
    "",
    undefined,
    ["/a", "/b"],
  ])("falls back to /inicio for %s", (path) => {
    expect(safeRedirectPath(path)).toBe("/inicio");
  });
});
