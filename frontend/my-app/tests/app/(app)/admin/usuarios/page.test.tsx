import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import UsersAdminPage from "@/app/(app)/admin/usuarios/page";
import { SessionProvider } from "@/features/auth/session/session-provider";
import { getCurrentUser, type RoleCode } from "@/lib/auth";
import { listUsers } from "@/lib/users";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/admin/usuarios",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/users", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/users")>()),
  listUsers: vi.fn(),
}));

const getCurrentUserMock = vi.mocked(getCurrentUser);
const listUsersMock = vi.mocked(listUsers);

function renderPageFor(roles: RoleCode[]) {
  getCurrentUserMock.mockResolvedValue({
    id: "3f0c2b1e-0000-4000-8000-000000000001",
    email: "ana.perez@unal.edu.co",
    first_name: "Ana",
    last_name: "Pérez",
    roles,
  });
  listUsersMock.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
  render(
    <SessionProvider>
      <UsersAdminPage />
    </SessionProvider>,
  );
}

describe("UsersAdminPage (T-01.16)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sends a non-administrator home without asking for the user list", async () => {
    renderPageFor(["STUDENT", "TEACHER"]);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/inicio"));
    expect(screen.queryByRole("heading", { name: "Usuarios" })).not.toBeInTheDocument();
    expect(listUsersMock).not.toHaveBeenCalled();
  });

  it("shows user administration to an administrator", async () => {
    renderPageFor(["ADMIN"]);

    expect(await screen.findByRole("heading", { name: "Usuarios" })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
