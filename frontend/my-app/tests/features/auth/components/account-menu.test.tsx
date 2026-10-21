import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AccountMenu from "@/features/auth/components/account-menu";
import { SessionProvider } from "@/features/auth/session/session-provider";
import { ApiError } from "@/lib/api-client";
import { getCurrentUser, logout, type RoleCode } from "@/lib/auth";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  getCurrentUser: vi.fn(),
  logout: vi.fn(),
}));

const getCurrentUserMock = vi.mocked(getCurrentUser);
const logoutMock = vi.mocked(logout);

async function renderMenuFor(roles: RoleCode[], names = { first_name: "Ana", last_name: "Pérez" }) {
  getCurrentUserMock.mockResolvedValue({
    id: "3f0c2b1e-0000-4000-8000-000000000001",
    email: "ana.perez@unal.edu.co",
    ...names,
    roles,
  });
  render(
    <SessionProvider>
      <AccountMenu />
    </SessionProvider>,
  );
  return screen.findByRole("button", { name: "Cerrar sesión" });
}

describe("AccountMenu", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows who is signed in, with initials and the primary role", async () => {
    await renderMenuFor(["TEACHER", "ADMIN"]);

    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByText("AP")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("Administrador")).toBeInTheDocument();
  });

  it("falls back to the email when the account has no name", async () => {
    await renderMenuFor(["STUDENT"], { first_name: "", last_name: "" });

    expect(screen.getByText("ana.perez@unal.edu.co")).toBeInTheDocument();
    expect(screen.getByText("Estudiante")).toBeInTheDocument();
  });

  it("signs out and goes to the login page", async () => {
    logoutMock.mockResolvedValue();
    const button = await renderMenuFor(["STUDENT"]);

    button.focus();
    fireEvent.click(button);

    expect(await screen.findByRole("button", { name: "Cerrando…" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(button).toHaveFocus();
    fireEvent.click(button);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });

  it("says so when signing out fails and lets the person try again", async () => {
    logoutMock.mockRejectedValue(new ApiError(0, "Network error"));
    const button = await renderMenuFor(["STUDENT"]);

    fireEvent.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos conectar con el servidor. Intenta de nuevo.",
    );
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).not.toHaveAttribute(
      "aria-disabled",
    );
    expect(replace).not.toHaveBeenCalled();
  });
});
