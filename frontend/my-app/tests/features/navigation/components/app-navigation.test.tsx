import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionProvider } from "@/features/auth/session/session-provider";
import AppNavigation from "@/features/navigation/components/app-navigation";
import { getCurrentUser, type RoleCode } from "@/lib/auth";

let pathname = "/inicio";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => pathname,
}));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  getCurrentUser: vi.fn(),
}));

const getCurrentUserMock = vi.mocked(getCurrentUser);

async function renderFor(roles: RoleCode[]) {
  getCurrentUserMock.mockResolvedValue({
    id: "3f0c2b1e-0000-4000-8000-000000000001",
    email: "ana.perez@unal.edu.co",
    first_name: "Ana",
    last_name: "Pérez",
    roles,
  });
  render(
    <SessionProvider>
      <AppNavigation />
    </SessionProvider>,
  );
  await screen.findByRole("link", { name: "Inicio" });
}

describe("AppNavigation", () => {
  afterEach(() => {
    pathname = "/inicio";
    vi.clearAllMocks();
  });

  it("links everyone to the home screen", async () => {
    await renderFor(["STUDENT"]);

    expect(screen.getByRole("link", { name: "Inicio" })).toHaveAttribute("href", "/inicio");
  });

  it("links administrators to user administration", async () => {
    await renderFor(["TEACHER", "ADMIN"]);

    expect(screen.getByRole("link", { name: "Usuarios" })).toHaveAttribute(
      "href",
      "/admin/usuarios",
    );
  });

  it("offers no such link to anyone else", async () => {
    await renderFor(["STUDENT", "MONITOR", "TEACHER"]);

    expect(screen.queryByRole("link", { name: "Usuarios" })).not.toBeInTheDocument();
  });

  it("marks the section in view as the current page", async () => {
    pathname = "/admin/usuarios";
    await renderFor(["ADMIN"]);

    expect(screen.getByRole("link", { name: "Usuarios" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current");
  });
});
