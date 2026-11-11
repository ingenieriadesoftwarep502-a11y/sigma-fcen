import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CatalogAdmin from "@/features/catalog/components/catalog-admin";
import {
  createAssignment,
  deleteAssignment,
  getCatalogSummary,
  getCurrentTerm,
  listAllDepartments,
  listAllTerms,
  listAssignments,
  listSubjects,
  NO_ASSIGNMENT_FILTERS,
} from "@/lib/catalog";
import { listUsers } from "@/lib/users";

import {
  ANA_ASSIGNMENT,
  CALCULO,
  MAT,
  MONITOR,
  pageOf,
  SUMMARY,
  TERM_1,
  TERM_2,
} from "../fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/admin/catalogo",
  useSearchParams: () => new URLSearchParams("vista=monitores"),
}));
vi.mock("@/lib/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/catalog")>()),
  getCatalogSummary: vi.fn(),
  listAllDepartments: vi.fn(),
  listAllTerms: vi.fn(),
  getCurrentTerm: vi.fn(),
  listSubjects: vi.fn(),
  listAssignments: vi.fn(),
  createAssignment: vi.fn(),
  deleteAssignment: vi.fn(),
}));
vi.mock("@/lib/users", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/users")>()),
  listUsers: vi.fn(),
}));

const listAssignmentsMock = vi.mocked(listAssignments);
const createAssignmentMock = vi.mocked(createAssignment);
const deleteAssignmentMock = vi.mocked(deleteAssignment);
const getCatalogSummaryMock = vi.mocked(getCatalogSummary);

async function renderAssignments() {
  render(<CatalogAdmin />);
  return screen.findByRole("table");
}

async function choose(scope: HTMLElement, label: string, typed: string, option: RegExp) {
  fireEvent.change(within(scope).getByRole("combobox", { name: label }), {
    target: { value: typed },
  });
  fireEvent.click(await within(scope).findByRole("option", { name: option }));
}

describe("CatalogAdmin monitor assignments (T-02.10, RF-023)", () => {
  beforeEach(() => {
    getCatalogSummaryMock.mockResolvedValue(SUMMARY);
    vi.mocked(listAllDepartments).mockResolvedValue([MAT]);
    vi.mocked(listAllTerms).mockResolvedValue([TERM_2, TERM_1]);
    vi.mocked(getCurrentTerm).mockResolvedValue(TERM_2);
    vi.mocked(listSubjects).mockResolvedValue(pageOf([CALCULO]));
    vi.mocked(listUsers).mockResolvedValue(pageOf([MONITOR]));
    listAssignmentsMock.mockResolvedValue(pageOf([ANA_ASSIGNMENT]));
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.style.overflow = "";
  });

  it("lists who monitors which subject and for how many hours", async () => {
    const table = await renderAssignments();
    const rows = within(table).getAllByRole("row");

    expect(rows[1]).toHaveTextContent("Ana Pérez");
    expect(rows[1]).toHaveTextContent("ana@unal.edu.co");
    expect(rows[1]).toHaveTextContent("Cálculo diferencial");
    expect(rows[1]).toHaveTextContent("6 h");
    expect(screen.getByText("1 asignación")).toBeInTheDocument();
    expect(listAssignmentsMock).toHaveBeenCalledWith(
      1,
      NO_ASSIGNMENT_FILTERS,
      expect.any(AbortSignal),
    );
  });

  it("assigns a monitor to a subject for a term", async () => {
    createAssignmentMock.mockResolvedValue({ ...ANA_ASSIGNMENT, id: 31 });
    await renderAssignments();

    fireEvent.click(screen.getByRole("button", { name: "Asignar monitor" }));
    const form = screen.getByRole("dialog", { name: "Asignar monitor" });
    await choose(form, "Monitor", "sof", /Sofía Ríos/);
    await choose(form, "Asignatura", "calc", /Cálculo diferencial/);
    await waitFor(() => expect(within(form).getByLabelText("Período")).toHaveValue("2026-2"));
    fireEvent.change(within(form).getByLabelText("Horas comprometidas"), {
      target: { value: "8" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Guardar asignación" }));

    await waitFor(() =>
      expect(createAssignmentMock).toHaveBeenCalledWith({
        monitor: "m-2",
        subject: 1,
        term: "2026-2",
        committed_hours: 8,
      }),
    );
    expect(vi.mocked(listUsers)).toHaveBeenCalledWith(
      1,
      { search: "sof", role: "MONITOR", isActive: true },
      expect.any(AbortSignal),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Se asignó a Sofía Ríos en MAT-101.",
    );
    // The coverage figures follow the change.
    await waitFor(() => expect(getCatalogSummaryMock).toHaveBeenCalledTimes(2));
  });

  it("asks for whole positive hours", async () => {
    await renderAssignments();

    fireEvent.click(screen.getByRole("button", { name: "Asignar monitor" }));
    const form = screen.getByRole("dialog", { name: "Asignar monitor" });
    fireEvent.change(within(form).getByLabelText("Horas comprometidas"), {
      target: { value: "0" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Guardar asignación" }));

    expect(within(form).getByText("Elige un monitor de la lista.")).toBeInTheDocument();
    expect(within(form).getByText("Elige una asignatura de la lista.")).toBeInTheDocument();
    expect(within(form).getByText("Ingresa un número entero de horas mayor que cero.")).toBeInTheDocument();
    expect(createAssignmentMock).not.toHaveBeenCalled();
  });

  it("withdraws an assignment only after confirming", async () => {
    deleteAssignmentMock.mockResolvedValue(undefined);
    await renderAssignments();

    const withdraw = screen.getByRole("button", {
      name: "Retirar a Ana Pérez de Cálculo diferencial",
    });
    fireEvent.click(withdraw);
    expect(deleteAssignmentMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(withdraw).toHaveFocus();

    fireEvent.click(withdraw);
    const confirm = screen.getByRole("button", { name: "Confirmar retiro" });
    expect(confirm).toHaveFocus();
    fireEvent.click(confirm);

    await waitFor(() => expect(deleteAssignmentMock).toHaveBeenCalledWith(30));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Se retiró a Ana Pérez de MAT-101.",
    );
  });
});
