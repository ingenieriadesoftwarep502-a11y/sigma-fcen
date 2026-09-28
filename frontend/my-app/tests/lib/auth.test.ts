import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isInstitutionalEmail, login, register } from "@/lib/auth";

const BASE_URL = "http://api.test/api/v1";
const USER = {
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

  it("logs in with email and password and returns the user", async () => {
    fetchMock.mockResolvedValue(jsonResponse(USER));

    const user = await login("ana.perez@unal.edu.co", "Str0ng-Passw0rd!");

    expect(user).toEqual(USER);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/auth/login/`);
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
    expect(JSON.parse(String(init?.body))).toEqual({
      email: "ana.perez@unal.edu.co",
      password: "Str0ng-Passw0rd!",
    });
  });

  it("registers a new student account", async () => {
    fetchMock.mockResolvedValue(jsonResponse(USER, 201));
    const data = {
      email: "ana.perez@unal.edu.co",
      password: "Str0ng-Passw0rd!",
      first_name: "Ana",
      last_name: "Pérez",
    };

    const user = await register(data);

    expect(user).toEqual(USER);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/auth/register/`);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual(data);
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
