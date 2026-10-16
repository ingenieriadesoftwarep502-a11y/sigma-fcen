import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AvailabilityPage from "@/app/(app)/disponibilidad/page";
import { SessionProvider } from "@/features/auth/session/session-provider";
import { getCurrentUser, type RoleCode } from "@/lib/auth";
import * as availability from "@/lib/availability";
import * as catalog from "@/lib/catalog";

const replace = vi.fn();
const EMPTY_PAGE = { count: 0, next: null, previous: null, results: [] };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/disponibilidad",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/catalog")>()),
  listMyAssignments: vi.fn(),
  listAllTerms: vi.fn(),
  getCurrentTerm: vi.fn(),
}));
vi.mock("@/lib/availability", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/availability")>()),
  listMySlots: vi.fn(),
  listMyTemplates: vi.fn(),
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
      <AvailabilityPage />
    </SessionProvider>,
  );
}

describe("AvailabilityPage", () => {
  beforeEach(() => {
    vi.mocked(catalog.listMyAssignments).mockResolvedValue([]);
    vi.mocked(catalog.listAllTerms).mockResolvedValue([]);
    vi.mocked(catalog.getCurrentTerm).mockResolvedValue(null);
    vi.mocked(availability.listMySlots).mockResolvedValue(EMPTY_PAGE);
    vi.mocked(availability.listMyTemplates).mockResolvedValue(EMPTY_PAGE);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sends anyone without the monitor role home", async () => {
    renderPageFor(["STUDENT", "TEACHER", "ADMIN"]);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/inicio"));
    expect(screen.queryByRole("heading", { name: "Mi disponibilidad" })).not.toBeInTheDocument();
    expect(availability.listMySlots).not.toHaveBeenCalled();
  });

  it("shows the page to a monitor", async () => {
    renderPageFor(["STUDENT", "MONITOR"]);

    expect(
      await screen.findByRole("heading", { name: "Mi disponibilidad", level: 1 }),
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalledWith("/inicio");
  });
});
