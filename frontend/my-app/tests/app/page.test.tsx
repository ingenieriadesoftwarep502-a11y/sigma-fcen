import { describe, expect, it, vi } from "vitest";

import Home from "@/app/page";

const redirect = vi.fn();

vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));

describe("Home page", () => {
  it("sends visitors to the login screen", () => {
    Home();

    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
