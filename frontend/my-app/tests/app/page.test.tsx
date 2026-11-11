import { describe, expect, it, vi } from "vitest";

import Root from "@/app/page";

const redirect = vi.fn();

vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));

describe("Root page", () => {
  it("sends everyone to the signed-in home, which asks guests to log in", () => {
    Root();

    expect(redirect).toHaveBeenCalledWith("/inicio");
  });
});
