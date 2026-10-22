import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SessionsPage from "@/app/(app)/sesiones/page";
import { SessionProvider } from "@/features/auth/session/session-provider";
import { getCurrentUser, type RoleCode } from "@/lib/auth";
import { listMySessions, listPendingSlots } from "@/lib/sessions";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/sesiones",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/sessions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sessions")>()),
  listMySessions: vi.fn(),
  listPendingSlots: vi.fn(),
}));

function renderPageFor(roles: RoleCode[]) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: "3f0c2b1e-0000-4000-8000-000000000001",
    email: "sofia.diaz@unal.edu.co",
    first_name: "Sofía",
    last_name: "Díaz",
    roles,
  });
  render(
    <SessionProvider>
      <SessionsPage />
    </SessionProvider>,
  );
}

describe("SessionsPage (FASE-05)", () => {
  beforeEach(() => {
    vi.mocked(listPendingSlots).mockResolvedValue([]);
    vi.mocked(listMySessions).mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows the page to monitors", async () => {
    renderPageFor(["MONITOR"]);

    expect(await screen.findByRole("heading", { name: "Sesiones", level: 1 })).toBeInTheDocument();
  });

  it("sends everyone else home", async () => {
    renderPageFor(["STUDENT", "TEACHER"]);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/inicio"));
    expect(listPendingSlots).not.toHaveBeenCalled();
  });
});
