import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AccountMenu from "@/features/auth/components/account-menu";
import { SessionProvider } from "@/features/auth/session/session-provider";
import { getCurrentUser, type RoleCode } from "@/lib/auth";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  getCurrentUser: vi.fn(),
}));

const getCurrentUserMock = vi.mocked(getCurrentUser);

async function renderMenuFor(roles: RoleCode[]) {
  getCurrentUserMock.mockResolvedValue({
    id: "3f0c2b1e-0000-4000-8000-000000000001",
    email: "ana.perez@unal.edu.co",
    first_name: "Ana",
    last_name: "Pérez",
    roles,
  });
  render(
    <SessionProvider>
      <AccountMenu />
    </SessionProvider>,
  );
  await screen.findByRole("button", { name: "Cerrar sesión" });
}

describe("AccountMenu entry points (T-01.16)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("links administrators to user administration", async () => {
    await renderMenuFor(["TEACHER", "ADMIN"]);

    expect(screen.getByRole("link", { name: "Usuarios" })).toHaveAttribute(
      "href",
      "/admin/usuarios",
    );
  });

  it("offers no such link to anyone else", async () => {
    await renderMenuFor(["STUDENT", "MONITOR", "TEACHER"]);

    expect(screen.queryByRole("link", { name: "Usuarios" })).not.toBeInTheDocument();
  });
});
