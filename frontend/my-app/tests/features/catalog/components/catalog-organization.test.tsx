import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CatalogAdmin from "@/features/catalog/components/catalog-admin";
import {
  createDepartment,
  createTerm,
  getCatalogSummary,
  getCurrentTerm,
  listAllDepartments,
  listAllTerms,
  TERM_CODE_MESSAGE,
  updateDepartment,
} from "@/lib/catalog";

import { FIS, MAT, QUI, SUMMARY, TERM_1, TERM_2 } from "../fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/admin/catalogo",
  useSearchParams: () => new URLSearchParams("vista=organizacion"),
}));
vi.mock("@/lib/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/catalog")>()),
  getCatalogSummary: vi.fn(),
  listAllDepartments: vi.fn(),
  listAllTerms: vi.fn(),
  getCurrentTerm: vi.fn(),
  createDepartment: vi.fn(),
  updateDepartment: vi.fn(),
  createTerm: vi.fn(),
}));

const listAllDepartmentsMock = vi.mocked(listAllDepartments);
const listAllTermsMock = vi.mocked(listAllTerms);
const createTermMock = vi.mocked(createTerm);

async function renderOrganization() {
  render(<CatalogAdmin />);
  return screen.findByRole("tabpanel", { name: "Departamentos y períodos" });
}

describe("CatalogAdmin departments and terms", () => {
  beforeEach(() => {
    vi.mocked(getCatalogSummary).mockResolvedValue(SUMMARY);
    listAllDepartmentsMock.mockResolvedValue([MAT, FIS, QUI]);
    listAllTermsMock.mockResolvedValue([TERM_2, TERM_1]);
    vi.mocked(getCurrentTerm).mockResolvedValue(TERM_2);
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.style.overflow = "";
  });

  it("lists departments with their status and terms with the current one marked", async () => {
    const panel = await renderOrganization();

    const departments = await within(panel).findByRole("list", { name: "Departamentos" });
    expect(within(departments).getAllByRole("listitem")).toHaveLength(3);
    expect(departments).toHaveTextContent("Química");
    expect(departments).toHaveTextContent("Inactivo");

    const terms = await within(panel).findByRole("list", { name: "Períodos" });
    const [current, previous] = within(terms).getAllByRole("listitem");
    expect(current).toHaveTextContent("2026-2");
    expect(current).toHaveTextContent("Actual");
    expect(previous).not.toHaveTextContent("Actual");
  });

  it("creates a department and refreshes the list", async () => {
    vi.mocked(createDepartment).mockResolvedValue({ id: 4, code: "EST", name: "Estadística", is_active: true });
    const panel = await renderOrganization();
    await within(panel).findByRole("list", { name: "Departamentos" });

    fireEvent.click(within(panel).getByRole("button", { name: "Nuevo departamento" }));
    const form = screen.getByRole("dialog", { name: "Nuevo departamento" });
    fireEvent.change(within(form).getByLabelText("Código"), { target: { value: "est" } });
    fireEvent.change(within(form).getByLabelText("Nombre"), { target: { value: "Estadística" } });
    fireEvent.click(within(form).getByRole("button", { name: "Crear departamento" }));

    await waitFor(() =>
      expect(createDepartment).toHaveBeenCalledWith({
        code: "EST",
        name: "Estadística",
        is_active: true,
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Se creó el departamento EST.");
    await waitFor(() => expect(listAllDepartmentsMock).toHaveBeenCalledTimes(2));
  });

  it("reactivates a department", async () => {
    vi.mocked(updateDepartment).mockResolvedValue({ ...QUI, is_active: true });
    const panel = await renderOrganization();

    fireEvent.click(await within(panel).findByRole("button", { name: "Editar Química" }));
    const form = screen.getByRole("dialog", { name: "Editar departamento" });
    fireEvent.click(within(form).getByRole("checkbox", { name: "Departamento activo" }));
    fireEvent.click(within(form).getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(updateDepartment).toHaveBeenCalledWith(3, { is_active: true }));
  });

  it("checks the term code format before sending, with the API's message", async () => {
    const panel = await renderOrganization();

    fireEvent.click(within(panel).getByRole("button", { name: "Nuevo período" }));
    const form = screen.getByRole("dialog", { name: "Nuevo período" });
    fireEvent.change(within(form).getByLabelText("Código"), { target: { value: "2027-3" } });
    fireEvent.change(within(form).getByLabelText("Inicio"), { target: { value: "2027-06-01" } });
    fireEvent.change(within(form).getByLabelText("Fin"), { target: { value: "2027-02-01" } });
    fireEvent.click(within(form).getByRole("button", { name: "Crear período" }));

    expect(within(form).getByText(TERM_CODE_MESSAGE)).toBeInTheDocument();
    expect(
      within(form).getByText("La fecha de fin debe ser posterior al inicio."),
    ).toBeInTheDocument();
    expect(createTermMock).not.toHaveBeenCalled();
  });

  it("creates a term", async () => {
    createTermMock.mockResolvedValue({ id: 3, code: "2027-1", start_date: "2027-02-01", end_date: "2027-06-15" });
    const panel = await renderOrganization();

    fireEvent.click(within(panel).getByRole("button", { name: "Nuevo período" }));
    const form = screen.getByRole("dialog", { name: "Nuevo período" });
    fireEvent.change(within(form).getByLabelText("Código"), { target: { value: "2027-1" } });
    fireEvent.change(within(form).getByLabelText("Inicio"), { target: { value: "2027-02-01" } });
    fireEvent.change(within(form).getByLabelText("Fin"), { target: { value: "2027-06-15" } });
    fireEvent.click(within(form).getByRole("button", { name: "Crear período" }));

    await waitFor(() =>
      expect(createTermMock).toHaveBeenCalledWith({
        code: "2027-1",
        start_date: "2027-02-01",
        end_date: "2027-06-15",
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Se creó el período 2027-1.");
    await waitFor(() => expect(listAllTermsMock).toHaveBeenCalledTimes(2));
  });
});
