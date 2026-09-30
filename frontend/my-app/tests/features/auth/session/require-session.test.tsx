import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import RequireSession from "@/features/auth/session/require-session";
import { SessionProvider } from "@/features/auth/session/session-provider";
import { ApiError } from "@/lib/api-client";
import { getCurrentUser, logout, type RoleCode, type User } from "@/lib/auth";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/usuarios",
}));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  getCurrentUser: vi.fn(),
  logout: vi.fn(),
}));

const getCurrentUserMock = vi.mocked(getCurrentUser);
const logoutMock = vi.mocked(logout);

function userWith(roles: RoleCode[]): User {
  return {
    id: "3f0c2b1e-0000-4000-8000-000000000001",
    email: "ana.perez@unal.edu.co",
    first_name: "Ana",
    last_name: "Pérez",
    roles,
  };
}

function renderGuard(roles?: RoleCode[]) {
  render(
    <SessionProvider>
      <RequireSession roles={roles}>
        <p>Contenido privado</p>
      </RequireSession>
    </SessionProvider>,
  );
}

describe("RequireSession (T-01.15)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("says it is checking the session and hides the content meanwhile", () => {
    getCurrentUserMock.mockReturnValue(new Promise(() => {}));

    renderGuard();

    expect(screen.getByRole("status")).toHaveTextContent("Verificando tu sesión…");
    expect(screen.queryByText("Contenido privado")).not.toBeInTheDocument();
  });

  it("shows the content to a signed-in user", async () => {
    getCurrentUserMock.mockResolvedValue(userWith(["STUDENT"]));

    renderGuard();

    expect(await screen.findByText("Contenido privado")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("sends a guest to login and remembers where they were going", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    renderGuard();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login?next=%2Fusuarios"));
    expect(screen.queryByText("Contenido privado")).not.toBeInTheDocument();
  });

  it("sends a user without a permitted role home and never shows the content", async () => {
    getCurrentUserMock.mockResolvedValue(userWith(["STUDENT"]));

    renderGuard(["ADMIN"]);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/inicio"));
    expect(screen.queryByText("Contenido privado")).not.toBeInTheDocument();
  });

  it("lets in a user holding any of the permitted roles", async () => {
    getCurrentUserMock.mockResolvedValue(userWith(["STUDENT", "ADMIN"]));

    renderGuard(["ADMIN"]);

    expect(await screen.findByText("Contenido privado")).toBeInTheDocument();
  });

  it("explains a failure to reach the API and lets the person retry", async () => {
    getCurrentUserMock
      .mockRejectedValueOnce(new ApiError(0, "Network error"))
      .mockResolvedValueOnce(userWith(["STUDENT"]));

    renderGuard();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos conectar con el servidor. Intenta de nuevo.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Intentar de nuevo" }));
    expect(await screen.findByText("Contenido privado")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("signing out", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("closes the session on the API and goes to login", async () => {
    const { default: AccountMenu } = await import("@/features/auth/components/account-menu");
    getCurrentUserMock.mockResolvedValue(userWith(["STUDENT"]));
    logoutMock.mockResolvedValue(undefined);
    render(
      <SessionProvider>
        <AccountMenu />
      </SessionProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Cerrar sesión" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });

  it("says so when the session could not be closed", async () => {
    const { default: AccountMenu } = await import("@/features/auth/components/account-menu");
    getCurrentUserMock.mockResolvedValue(userWith(["STUDENT"]));
    logoutMock.mockRejectedValue(new ApiError(0, "Network error"));
    render(
      <SessionProvider>
        <AccountMenu />
      </SessionProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Cerrar sesión" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos conectar");
    expect(replace).not.toHaveBeenCalled();
  });
});
