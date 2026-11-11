import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionProvider } from "@/features/auth/session/session-provider";
import MyReservations from "@/features/reservations/components/my-reservations";
import { getCurrentUser } from "@/lib/auth";
import { listMyReservations } from "@/lib/reservations";

import { pageOf } from "../../availability/fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/mis-reservas",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  getCurrentUser: vi.fn(),
}));
// A different window proves the page reads the policy instead of repeating its number.
vi.mock("@/lib/reservations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/reservations")>()),
  CANCEL_WINDOW_HOURS: 6,
  listMyReservations: vi.fn(),
}));

describe("MyReservations cancellation policy (ADR-011)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("states the window from CANCEL_WINDOW_HOURS", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "s-1",
      email: "ana.perez@unal.edu.co",
      first_name: "Ana",
      last_name: "Pérez",
      roles: ["STUDENT"],
    });
    vi.mocked(listMyReservations).mockResolvedValue(pageOf([]));

    render(
      <SessionProvider>
        <MyReservations />
      </SessionProvider>,
    );

    expect(await screen.findByText(/hasta 6 horas antes del inicio/)).toBeInTheDocument();
  });
});
