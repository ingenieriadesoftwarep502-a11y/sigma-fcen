import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HistoryPage from "@/app/(app)/historial/page";
import { SessionProvider } from "@/features/auth/session/session-provider";
import { getCurrentUser, type RoleCode } from "@/lib/auth";
import { listHistory } from "@/lib/sessions";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/historial",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/sessions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sessions")>()),
  listHistory: vi.fn(),
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
      <HistoryPage />
    </SessionProvider>,
  );
}

describe("HistoryPage (HU-12)", () => {
  beforeEach(() => {
    vi.mocked(listHistory).mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows the page to students", async () => {
    renderPageFor(["STUDENT"]);

    expect(await screen.findByRole("heading", { name: "Historial", level: 1 })).toBeInTheDocument();
  });

  it("sends everyone else home", async () => {
    renderPageFor(["MONITOR", "ADMIN"]);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/inicio"));
    expect(listHistory).not.toHaveBeenCalled();
  });
});
