import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AdminDashboard from "@/features/dashboard/components/admin-dashboard";
import { ApiError } from "@/lib/api-client";
import { getCatalogSummary } from "@/lib/catalog";
import { saveFile } from "@/lib/download";
import { exportUsers, getUserSummary, NO_FILTERS, type UserSummary } from "@/lib/users";

vi.mock("@/lib/users", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/users")>()),
  getUserSummary: vi.fn(),
  exportUsers: vi.fn(),
}));
vi.mock("@/lib/download", () => ({ saveFile: vi.fn() }));
vi.mock("@/lib/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/catalog")>()),
  getCatalogSummary: vi.fn(),
}));

const getUserSummaryMock = vi.mocked(getUserSummary);
const exportUsersMock = vi.mocked(exportUsers);
const saveFileMock = vi.mocked(saveFile);

const ANA = { id: "a", email: "ana.perez@unal.edu.co", full_name: "Ana Pérez" };
const LUIS = { id: "l", email: "luis.gomez@unal.edu.co", full_name: "Luis Gómez" };

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

const SUMMARY: UserSummary = {
  total: 128,
  active: 120,
  inactive: 8,
  joined_last_30_days: 14,
  by_role: { STUDENT: 100, MONITOR: 12, TEACHER: 20, ADMIN: 3 },
  recent_activity: [
    { id: 2, action: "ROLES_CHANGED", created_at: minutesAgo(5), actor: ANA, target: LUIS },
    { id: 1, action: "USER_CREATED", created_at: minutesAgo(180), actor: ANA, target: LUIS },
  ],
};

const CATALOG = {
  term: "2026-2",
  subjects_active: 120,
  departments_active: 6,
  courses: 48,
  courses_without_teacher: 5,
  courses_without_monitor: 12,
  monitor_assignments: 30,
  committed_hours_total: 180,
};

async function renderDashboard(summary: UserSummary = SUMMARY) {
  getUserSummaryMock.mockResolvedValue(summary);
  vi.mocked(getCatalogSummary).mockResolvedValue(CATALOG);
  render(<AdminDashboard firstName="Ana" />);
  await screen.findByRole("heading", { name: "Actividad reciente" });
}

describe("AdminDashboard", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("greets the administrator", async () => {
    await renderDashboard();

    expect(screen.getByRole("heading", { level: 1, name: "Hola, Ana." })).toBeInTheDocument();
  });

  it("links to the catalog with the coverage of the current term", async () => {
    await renderDashboard();

    const card = await screen.findByRole("region", { name: "Catálogo 2026-2" });
    expect(card).toHaveTextContent("48 cursos");
    expect(card).toHaveTextContent("5 sin docente");
    expect(card).toHaveTextContent("12 sin monitor");
    expect(within(card).getByRole("link", { name: "Abrir catálogo" })).toHaveAttribute(
      "href",
      "/admin/catalogo",
    );
  });

  it("still links to the catalog when its figures fail", async () => {
    getUserSummaryMock.mockResolvedValue(SUMMARY);
    vi.mocked(getCatalogSummary).mockRejectedValue(new ApiError(0, "down"));
    render(<AdminDashboard firstName="Ana" />);

    expect(await screen.findByRole("link", { name: "Abrir catálogo" })).toBeInTheDocument();
  });

  it("shows the headline numbers", async () => {
    await renderDashboard();

    const figures = within(screen.getByRole("region", { name: "Cifras de usuarios" }));
    expect(figures.getByText("Usuarios totales").nextElementSibling).toHaveTextContent("128");
    expect(figures.getByText("Activos").nextElementSibling).toHaveTextContent("120");
    expect(figures.getByText("Inactivos").nextElementSibling).toHaveTextContent("8");
    expect(figures.getByText("Nuevos en 30 días").nextElementSibling).toHaveTextContent("14");
  });

  it("breaks the accounts down by role with their counts", async () => {
    await renderDashboard();

    const roles = within(screen.getByRole("region", { name: "Distribución por rol" }));
    const items = roles.getAllByRole("listitem").map((item) => item.textContent);
    expect(items).toEqual([
      expect.stringMatching(/Estudiante.*100/),
      expect.stringMatching(/Monitor.*12/),
      expect.stringMatching(/Docente.*20/),
      expect.stringMatching(/Administrador.*3/),
    ]);
  });

  it("tells the recent activity as sentences with relative times", async () => {
    await renderDashboard();

    const feed = within(screen.getByRole("region", { name: "Actividad reciente" }));
    const items = feed.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Ana Pérez cambió los roles de Luis Gómez.");
    expect(items[0]).toHaveTextContent("hace 5 minutos");
    expect(items[1]).toHaveTextContent("Ana Pérez creó la cuenta de Luis Gómez.");
    expect(items[1]).toHaveTextContent("hace 3 horas");
  });

  it("explains an empty activity feed", async () => {
    await renderDashboard({ ...SUMMARY, recent_activity: [] });

    expect(screen.getByText(/Aún no hay actividad/)).toBeInTheDocument();
  });

  it("shows placeholders while the summary loads", () => {
    getUserSummaryMock.mockReturnValue(new Promise(() => {}));

    render(<AdminDashboard firstName="Ana" />);

    expect(screen.getByRole("status")).toHaveTextContent("Cargando resumen…");
  });

  it("explains a failure to load and lets the person retry", async () => {
    getUserSummaryMock
      .mockRejectedValueOnce(new ApiError(0, "Network error"))
      .mockResolvedValueOnce(SUMMARY);
    render(<AdminDashboard firstName="Ana" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos conectar con el servidor. Intenta de nuevo.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Intentar de nuevo" }));

    expect(await screen.findByRole("heading", { name: "Actividad reciente" })).toBeInTheDocument();
    expect(getUserSummaryMock).toHaveBeenCalledTimes(2);
  });

  it("links to the create form of user administration", async () => {
    await renderDashboard();

    expect(screen.getByRole("link", { name: "Nuevo usuario" })).toHaveAttribute(
      "href",
      "/admin/usuarios?nuevo=1",
    );
  });

  it("downloads every user as a spreadsheet", async () => {
    await renderDashboard();
    const blob = new Blob(["xlsx"]);
    let finish: (file: { blob: Blob; filename: string }) => void = () => {};
    exportUsersMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));

    const button = screen.getByRole("button", { name: "Exportar usuarios" });
    button.focus();
    fireEvent.click(button);

    expect(await screen.findByRole("button", { name: "Exportando…" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(exportUsersMock).toHaveBeenCalledTimes(1);
    finish({ blob, filename: "usuarios.xlsx" });
    await vi.waitFor(() => expect(saveFileMock).toHaveBeenCalledWith(blob, "usuarios.xlsx"));
    expect(exportUsersMock).toHaveBeenCalledWith(NO_FILTERS);
  });

  it("says so when the export fails", async () => {
    await renderDashboard();
    exportUsersMock.mockRejectedValue(new ApiError(0, "Network error"));

    fireEvent.click(screen.getByRole("button", { name: "Exportar usuarios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos conectar");
    expect(saveFileMock).not.toHaveBeenCalled();
  });
});
