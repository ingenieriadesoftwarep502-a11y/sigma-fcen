import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { forgetCsrfToken } from "@/lib/api-client";
import {
  type AdminUser,
  createUser,
  deactivateUser,
  listUsers,
  setUserRoles,
  updateUser,
} from "@/lib/users";

const BASE_URL = "http://api.test/api/v1";
const CSRF_URL = `${BASE_URL}/auth/csrf/`;
const USER: AdminUser = {
  id: "3f0c2b1e-0000-4000-8000-000000000002",
  email: "luis.gomez@unal.edu.co",
  first_name: "Luis",
  last_name: "Gómez",
  roles: ["TEACHER"],
  is_active: true,
  date_joined: "2026-02-01T10:00:00Z",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("users API (T-01.16)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  function respond(body: unknown) {
    fetchMock.mockImplementation((url) =>
      Promise.resolve(url === CSRF_URL ? jsonResponse({ csrfToken: "token" }) : jsonResponse(body)),
    );
  }

  /** Method and JSON body of the only call to `path`. */
  function requestTo(path: string): { method: string; body: unknown } {
    const calls = fetchMock.mock.calls.filter(([url]) => url === `${BASE_URL}${path}`);
    expect(calls).toHaveLength(1);
    const init = calls[0]?.[1];
    return {
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
    fetchMock.mockReset();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("lists one page of users", async () => {
    const page = { count: 1, next: null, previous: null, results: [USER] };
    respond(page);

    expect(await listUsers(2)).toEqual(page);
    expect(requestTo("/users/?page=2")).toEqual({ method: "GET", body: undefined });
  });

  it("creates a user with the chosen roles", async () => {
    respond(USER);
    const data = {
      email: USER.email,
      password: "Str0ng-Passw0rd!",
      first_name: "Luis",
      last_name: "Gómez",
      roles: ["TEACHER" as const],
    };

    expect(await createUser(data)).toEqual(USER);
    expect(requestTo("/users/")).toEqual({ method: "POST", body: data });
  });

  it("edits identity fields with a partial update", async () => {
    respond(USER);

    await updateUser(USER.id, { first_name: "Luis" });

    expect(requestTo(`/users/${USER.id}/`)).toEqual({
      method: "PATCH",
      body: { first_name: "Luis" },
    });
  });

  it("replaces the roles through their own endpoint", async () => {
    respond(USER);

    await setUserRoles(USER.id, ["TEACHER", "ADMIN"]);

    expect(requestTo(`/users/${USER.id}/roles/`)).toEqual({
      method: "POST",
      body: { roles: ["TEACHER", "ADMIN"] },
    });
  });

  it("asks for the deactivation impact, or confirms it", async () => {
    respond({ deactivated: false, impact: { future_reservations: 0 }, user: USER });

    await deactivateUser(USER.id, { confirm: false });

    expect(requestTo(`/users/${USER.id}/deactivate/`)).toEqual({
      method: "POST",
      body: { confirm: false },
    });
  });
});
