import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionProvider } from "@/features/auth/session/session-provider";
import HomeScreen from "@/features/dashboard/components/home-screen";
import { pinnedKey } from "@/features/catalog/pinned-subjects";
import { getCurrentUser, type RoleCode } from "@/lib/auth";
import { getSubject } from "@/lib/catalog";
import { getUserSummary } from "@/lib/users";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/catalog")>()),
  getCatalogSummary: () => new Promise(() => {}),
  getSubject: vi.fn(),
}));
vi.mock("@/lib/users", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/users")>()),
  getUserSummary: vi.fn(),
}));

const getCurrentUserMock = vi.mocked(getCurrentUser);
const getUserSummaryMock = vi.mocked(getUserSummary);
const getSubjectMock = vi.mocked(getSubject);

const USER_ID = "3f0c2b1e-0000-4000-8000-000000000001";
const MAT = { id: 1, code: "MAT", name: "Matemáticas" };
const CALCULO = {
  id: 1,
  code: "MAT-101",
  name: "Cálculo diferencial",
  credits: 4,
  is_active: true,
  department: MAT,
  monitor_count: 2,
};
const ALGEBRA = { ...CALCULO, id: 2, code: "MAT-102", name: "Álgebra lineal", monitor_count: 0 };

function renderFor(roles: RoleCode[]) {
  getCurrentUserMock.mockResolvedValue({
    id: USER_ID,
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
    localStorage.clear();
  });

  it("gives administrators the user dashboard", async () => {
    renderFor(["TEACHER", "ADMIN"]);

    expect(await screen.findByRole("heading", { name: "Hola, Ana." })).toBeInTheDocument();
    // The dashboard asks for the summary in a passive effect, which React may flush
    // after the heading is already in the DOM (the session resolved outside act()).
    await waitFor(() => expect(getUserSummaryMock).toHaveBeenCalledTimes(1));
  });

  it("greets everyone else without account details or admin data", async () => {
    renderFor(["STUDENT", "MONITOR"]);

    expect(await screen.findByRole("heading", { name: "Hola, Ana." })).toBeInTheDocument();
    expect(screen.queryByText("ana.perez@unal.edu.co")).not.toBeInTheDocument();
    expect(screen.queryByText("Estudiante")).not.toBeInTheDocument();
    expect(screen.queryByText("Monitor")).not.toBeInTheDocument();
    expect(getUserSummaryMock).not.toHaveBeenCalled();
  });

  it("shows a student their pinned subjects, each opening the subject", async () => {
    localStorage.setItem(pinnedKey(USER_ID), JSON.stringify([2, 1]));
    getSubjectMock.mockImplementation((id) =>
      Promise.resolve(id === 1 ? CALCULO : ALGEBRA),
    );
    renderFor(["STUDENT"]);

    const pinned = await screen.findByRole("region", { name: "Mis asignaturas" });
    const algebra = await within(pinned).findByRole("link", { name: "Álgebra lineal" });
    expect(algebra).toHaveAttribute("href", "/asignaturas/2");
    expect(within(pinned).getByRole("link", { name: "Cálculo diferencial" })).toHaveAttribute(
      "href",
      "/asignaturas/1",
    );
    // Most recent pin first, as in the catalog.
    const names = within(pinned).getAllByRole("link").map((link) => link.textContent);
    expect(names).toEqual(["Álgebra lineal", "Cálculo diferencial"]);
    expect(getSubjectMock).toHaveBeenCalledWith(1, null, expect.any(AbortSignal));
  });

  it("lets a student unpin a subject from the home", async () => {
    localStorage.setItem(pinnedKey(USER_ID), JSON.stringify([1]));
    getSubjectMock.mockResolvedValue(CALCULO);
    renderFor(["STUDENT"]);

    const pinned = await screen.findByRole("region", { name: "Mis asignaturas" });
    fireEvent.click(
      await within(pinned).findByRole("button", { name: "Fijar Cálculo diferencial en Mis asignaturas" }),
    );

    expect(await within(pinned).findByText("Aún no has fijado asignaturas.")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(pinnedKey(USER_ID)) ?? "null")).toEqual([]);
  });

  it("points a student without pinned subjects to the catalog", async () => {
    renderFor(["STUDENT"]);

    const pinned = await screen.findByRole("region", { name: "Mis asignaturas" });
    expect(within(pinned).getByText("Aún no has fijado asignaturas.")).toBeInTheDocument();
    expect(within(pinned).getByRole("link", { name: "Explorar asignaturas" })).toHaveAttribute(
      "href",
      "/asignaturas",
    );
    expect(getSubjectMock).not.toHaveBeenCalled();
  });

  it("keeps pinned subjects from people who are not students", async () => {
    renderFor(["MONITOR"]);

    expect(await screen.findByRole("heading", { name: "Hola, Ana." })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Mis asignaturas" })).not.toBeInTheDocument();
  });
});
