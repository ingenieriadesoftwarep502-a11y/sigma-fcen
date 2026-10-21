import { describe, expect, it, vi } from "vitest";

import SlotSearchPage from "@/app/(app)/buscar-monitorias/page";

const redirect = vi.fn();

vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));

describe("SlotSearchPage", () => {
  it("sends old links to the subjects, where each subject shows its slots", () => {
    SlotSearchPage();

    expect(redirect).toHaveBeenCalledWith("/asignaturas");
  });
});
