import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SlotSearchPage from "@/app/(app)/buscar-monitorias/page";
import { SessionProvider } from "@/features/auth/session/session-provider";
import { getCurrentUser, type RoleCode } from "@/lib/auth";
import * as availability from "@/lib/availability";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/buscar-monitorias",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/availability", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/availability")>()),
  searchSlots: vi.fn(),
}));

function renderPageFor(roles: RoleCode[]) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: "3f0c2b1e-0000-4000-8000-000000000001",
    email: "ana.perez@unal.edu.co",
    first_name: "Ana",
    last_name: "Pérez",
    roles,
  });
  render(
    <SessionProvider>
      <SlotSearchPage />
    </SessionProvider>,
  );
}

describe("SlotSearchPage", () => {
  beforeEach(() => {
    vi.mocked(availability.searchSlots).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sends anyone without the student role home", async () => {
    renderPageFor(["MONITOR", "TEACHER", "ADMIN"]);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/inicio"));
    expect(screen.queryByRole("heading", { name: "Buscar monitorías" })).not.toBeInTheDocument();
    expect(availability.searchSlots).not.toHaveBeenCalled();
  });

  it("shows the search to a student", async () => {
    renderPageFor(["STUDENT"]);

    expect(
      await screen.findByRole("heading", { name: "Buscar monitorías", level: 1 }),
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalledWith("/inicio");
  });
});
