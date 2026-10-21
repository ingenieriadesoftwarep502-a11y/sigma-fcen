import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MyReservationsPage from "@/app/(app)/mis-reservas/page";
import { SessionProvider } from "@/features/auth/session/session-provider";
import { getCurrentUser, type RoleCode } from "@/lib/auth";
import { listMyReservations } from "@/lib/reservations";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/mis-reservas",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/reservations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/reservations")>()),
  listMyReservations: vi.fn(),
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
      <MyReservationsPage />
    </SessionProvider>,
  );
}

describe("MyReservationsPage", () => {
  beforeEach(() => {
    vi.mocked(listMyReservations).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each([[["STUDENT"]], [["MONITOR"]]] as RoleCode[][][])(
    "shows the page to %s",
    async (roles) => {
      renderPageFor(roles);

      expect(
        await screen.findByRole("heading", { name: "Mis reservas", level: 1 }),
      ).toBeInTheDocument();
    },
  );

  it("sends teachers and administrators home", async () => {
    renderPageFor(["TEACHER", "ADMIN"]);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/inicio"));
    expect(listMyReservations).not.toHaveBeenCalled();
  });
});
