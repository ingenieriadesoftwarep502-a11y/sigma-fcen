import { describe, expect, it, vi } from "vitest";

import AvailabilityPage from "@/app/(app)/disponibilidad/page";

const redirect = vi.fn();

vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));

describe("AvailabilityPage", () => {
  it("sends old links to the monitoring, where each assignment holds its availability", () => {
    AvailabilityPage();

    expect(redirect).toHaveBeenCalledWith("/mis-monitorias");
  });
});
