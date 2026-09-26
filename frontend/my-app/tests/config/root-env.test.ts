import { describe, expect, it } from "vitest";

import { publicEnvFrom } from "@/next.config";

const ROOT_ENV = [
  "SECRET_KEY=backend-only-secret",
  "DATABASE_URL=postgres://user:pass@localhost:5432/db",
  "NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1",
].join("\n");

describe("publicEnvFrom (repo-root .env shared with the backend)", () => {
  it("exposes only NEXT_PUBLIC_* keys to the frontend", () => {
    expect(publicEnvFrom(ROOT_ENV, {})).toEqual({
      NEXT_PUBLIC_API_URL: "http://localhost:8000/api/v1",
    });
  });

  it("never leaks backend secrets", () => {
    const env = publicEnvFrom(ROOT_ENV, {});

    expect(env).not.toHaveProperty("SECRET_KEY");
    expect(env).not.toHaveProperty("DATABASE_URL");
  });

  it("lets a real environment variable override the file (CI)", () => {
    const env = publicEnvFrom(ROOT_ENV, { NEXT_PUBLIC_API_URL: "https://ci.example/api/v1" });

    expect(env.NEXT_PUBLIC_API_URL).toBe("https://ci.example/api/v1");
  });

  it("returns an empty object when there is no .env content", () => {
    expect(publicEnvFrom("", {})).toEqual({});
  });
});
