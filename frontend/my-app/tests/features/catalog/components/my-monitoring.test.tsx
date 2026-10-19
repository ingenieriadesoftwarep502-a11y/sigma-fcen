import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MyMonitoring from "@/features/catalog/components/my-monitoring";
import { ApiError } from "@/lib/api-client";
import {
  getCurrentTerm,
  listAllTerms,
  listMyAssignments,
  type MonitorOwnAssignment,
} from "@/lib/catalog";

const replace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/mis-monitorias",
  useSearchParams: () => searchParams,
}));
vi.mock("@/lib/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/catalog")>()),
  listMyAssignments: vi.fn(),
  listAllTerms: vi.fn(),
  getCurrentTerm: vi.fn(),
}));

const TERM_2 = { id: 2, code: "2026-2", start_date: "2026-08-01", end_date: "2026-12-10" };
const TERM_1 = { id: 1, code: "2026-1", start_date: "2026-02-01", end_date: "2026-06-10" };
const MAT = { id: 1, code: "MAT", name: "Matemáticas" };
const FIS = { id: 2, code: "FIS", name: "Física" };

const CALCULO: MonitorOwnAssignment = {
  id: 10,
  subject: { id: 1, code: "MAT-101", name: "Cálculo diferencial", credits: 4, department: MAT },
  term: "2026-2",
  committed_hours: 6,
  teachers: [
    { id: "t-1", full_name: "Laura Gómez", email: "laura@unal.edu.co", group: "1" },
    { id: "t-2", full_name: "Pedro Ruiz", email: "pedro@unal.edu.co", group: "2" },
  ],
  upcoming_slots: 5,
  next_slot_at: "2026-10-20T15:00:00Z",
  active_templates: 1,
};
const MECANICA: MonitorOwnAssignment = {
  id: 11,
  subject: { id: 2, code: "FIS-201", name: "Mecánica", credits: 3, department: FIS },
  term: "2026-2",
  committed_hours: 4,
  teachers: [],
  upcoming_slots: 0,
  next_slot_at: null,
  active_templates: 0,
};

const listMock = vi.mocked(listMyAssignments);

describe("MyMonitoring", () => {
  beforeEach(() => {
    searchParams = new URLSearchParams();
    vi.mocked(listAllTerms).mockResolvedValue([TERM_2, TERM_1]);
    vi.mocked(getCurrentTerm).mockResolvedValue(TERM_2);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows each assigned subject with its hours, availability and teachers", async () => {
    listMock.mockResolvedValue([CALCULO, MECANICA]);
    render(<MyMonitoring />);

    const calculo = await screen.findByRole("article", { name: /Cálculo diferencial/ });
    expect(calculo).toHaveTextContent("MAT-101");
    expect(calculo).toHaveTextContent("4 créditos");
    expect(calculo).toHaveTextContent("Matemáticas");
    expect(calculo).toHaveTextContent("6 h");
    expect(calculo).toHaveTextContent("5franjas disponibles");
    expect(calculo).toHaveTextContent(/Próxima: .+, 10:00/);
    expect(calculo).toHaveTextContent("1 plantilla activa");
    expect(calculo).toHaveTextContent("Laura Gómez · G1, Pedro Ruiz · G2");
    expect(calculo).toHaveTextContent("Organizar disponibilidad");

    const mecanica = screen.getByRole("article", { name: /Mecánica/ });
    expect(mecanica).toHaveTextContent("Sin franjas próximas");
    expect(mecanica).toHaveTextContent("Sin plantillas semanales");
    expect(mecanica).toHaveTextContent("Sin docentes asignados en el período");
    expect(mecanica).toHaveTextContent("Publicar disponibilidad");
    expect(screen.getByText("10 h comprometidas en el período")).toBeInTheDocument();
    expect(listMock).toHaveBeenCalledWith(null, expect.any(AbortSignal));
  });

  it("opens each assignment's workspace, in the assignment's own term", async () => {
    listMock.mockResolvedValue([CALCULO, { ...MECANICA, term: "2026-1" }]);
    render(<MyMonitoring />);

    expect(await screen.findByRole("link", { name: "Cálculo diferencial" })).toHaveAttribute(
      "href",
      "/mis-monitorias/10?periodo=2026-2",
    );
    expect(screen.getByRole("link", { name: "Mecánica" })).toHaveAttribute(
      "href",
      "/mis-monitorias/11?periodo=2026-1",
    );
  });

  it("reads the term from the URL", async () => {
    searchParams = new URLSearchParams("periodo=2026-1");
    listMock.mockResolvedValue([]);
    render(<MyMonitoring />);

    await waitFor(() => expect(listMock).toHaveBeenCalledWith("2026-1", expect.any(AbortSignal)));
  });

  it("switches to another term, keeps it in the URL and shows the empty state", async () => {
    listMock.mockResolvedValue([CALCULO]);
    render(<MyMonitoring />);
    const term = await screen.findByLabelText("Período");
    await waitFor(() => expect(term).toHaveValue("2026-2"));

    listMock.mockResolvedValue([]);
    fireEvent.change(term, { target: { value: "2026-1" } });

    await waitFor(() =>
      expect(listMock).toHaveBeenLastCalledWith("2026-1", expect.any(AbortSignal)),
    );
    expect(replace).toHaveBeenLastCalledWith("/mis-monitorias?periodo=2026-1", { scroll: false });
    expect(
      await screen.findByText("No tienes monitorías asignadas en este período."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/comprometidas en el período/)).not.toBeInTheDocument();
  });

  it("shows placeholders while loading", () => {
    listMock.mockReturnValue(new Promise(() => {}));
    render(<MyMonitoring />);

    expect(screen.getByRole("status")).toHaveTextContent("Cargando tus monitorías…");
  });

  it("reports a failure and tries again", async () => {
    listMock.mockRejectedValueOnce(new ApiError(0, "down", { detail: "Sin conexión." }));
    listMock.mockResolvedValueOnce([MECANICA]);
    render(<MyMonitoring />);

    expect(await screen.findByText("Sin conexión.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Intentar de nuevo" }));

    expect(await screen.findByRole("article", { name: /Mecánica/ })).toBeInTheDocument();
  });
});
