import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionProvider } from "@/features/auth/session/session-provider";
import HomeScreen from "@/features/dashboard/components/home-screen";
import { getCurrentUser, type RoleCode } from "@/lib/auth";
import { getUserSummary } from "@/lib/users";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/users", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/users")>()),
  getUserSummary: vi.fn(),
}));

const getCurrentUserMock = vi.mocked(getCurrentUser);
const getUserSummaryMock = vi.mocked(getUserSummary);

function renderFor(roles: RoleCode[]) {
  getCurrentUserMock.mockResolvedValue({
    id: "3f0c2b1e-0000-4000-8000-000000000001",
    email: "ana.perez@unal.edu.co",
    first_name: "Ana",
    last_name: "Pérez",
    roles,
  });
  getUserSummaryMock.mockReturnValue(new Promise(() => {}));
  render(
    <SessionProvider>
      <HomeScreen />
    </SessionProvider>,
  );
}

describe("HomeScreen", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("gives administrators the user dashboard", async () => {
    renderFor(["TEACHER", "ADMIN"]);

    expect(await screen.findByRole("heading", { name: "Hola, Ana." })).toBeInTheDocument();
    // The dashboard asks for the summary in a passive effect, which React may flush
    // after the heading is already in the DOM (the session resolved outside act()).
    await waitFor(() => expect(getUserSummaryMock).toHaveBeenCalledTimes(1));
  });

  it("shows everyone else their own account, without asking for admin data", async () => {
    renderFor(["STUDENT", "MONITOR"]);

    expect(await screen.findByRole("heading", { name: "Hola, Ana." })).toBeInTheDocument();
    expect(screen.getByText("ana.perez@unal.edu.co")).toBeInTheDocument();
    expect(screen.getByText("Estudiante")).toBeInTheDocument();
    expect(screen.getByText("Monitor")).toBeInTheDocument();
    expect(getUserSummaryMock).not.toHaveBeenCalled();
  });
});
