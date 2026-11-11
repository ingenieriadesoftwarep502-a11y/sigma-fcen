import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CatalogAdmin from "@/features/catalog/components/catalog-admin";
import { ApiError } from "@/lib/api-client";
import {
  createSubject,
  getCatalogSummary,
  getCurrentTerm,
  listAllDepartments,
  listAllTerms,
  listAssignments,
  listCourses,
  listSubjects,
  NO_COURSE_FILTERS,
  NO_SUBJECT_FILTERS,
  updateSubject,
} from "@/lib/catalog";

import { ALGEBRA, CALCULO, FIS, MAT, pageOf, QUI, SUMMARY, TERM_1, TERM_2 } from "../fixtures";

const replace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/admin/catalogo",
  useSearchParams: () => searchParams,
}));
vi.mock("@/lib/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/catalog")>()),
  getCatalogSummary: vi.fn(),
  listAllDepartments: vi.fn(),
  listAllTerms: vi.fn(),
  getCurrentTerm: vi.fn(),
  listSubjects: vi.fn(),
  createSubject: vi.fn(),
  updateSubject: vi.fn(),
  listCourses: vi.fn(),
  listAssignments: vi.fn(),
}));

const listSubjectsMock = vi.mocked(listSubjects);
const listCoursesMock = vi.mocked(listCourses);
const createSubjectMock = vi.mocked(createSubject);
const updateSubjectMock = vi.mocked(updateSubject);

async function renderAdmin() {
  render(<CatalogAdmin />);
  await screen.findByRole("heading", { name: "Catálogo", level: 1 });
}

function drawer(name: string) {
  return screen.getByRole("dialog", { name });
}

describe("CatalogAdmin (FASE-02)", () => {
  beforeEach(() => {
    searchParams = new URLSearchParams();
    vi.mocked(getCatalogSummary).mockResolvedValue(SUMMARY);
    vi.mocked(listAllDepartments).mockResolvedValue([MAT, FIS, QUI]);
    vi.mocked(listAllTerms).mockResolvedValue([TERM_2, TERM_1]);
    vi.mocked(getCurrentTerm).mockResolvedValue(TERM_2);
    listSubjectsMock.mockResolvedValue(pageOf([CALCULO, ALGEBRA]));
    listCoursesMock.mockResolvedValue(pageOf([]));
    vi.mocked(listAssignments).mockResolvedValue(pageOf([]));
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.style.overflow = "";
  });

  describe("coverage and navigation", () => {
    it("shows the coverage of the current term", async () => {
      await renderAdmin();

      const band = await screen.findByRole("region", { name: "Cobertura del período 2026-2" });
      expect(band).toHaveTextContent("48");
      expect(within(band).getByRole("button", { name: /Sin docente/ })).toHaveTextContent("5");
      expect(within(band).getByRole("button", { name: /Sin monitor/ })).toHaveTextContent("12");
      expect(band).toHaveTextContent("30");
      expect(band).toHaveTextContent("180");
    });

    it("opens on the subjects tab and switches tabs from the URL-synced tab list", async () => {
      await renderAdmin();

      const tabs = screen.getByRole("tablist", { name: "Secciones del catálogo" });
      const subjects = within(tabs).getByRole("tab", { name: "Asignaturas" });
      const courses = within(tabs).getByRole("tab", { name: "Cursos" });
      expect(subjects).toHaveAttribute("aria-selected", "true");
      expect(subjects).toHaveAttribute("tabindex", "0");
      expect(courses).toHaveAttribute("tabindex", "-1");
      expect(screen.getByRole("tabpanel", { name: "Asignaturas" })).toBeInTheDocument();

      subjects.focus();
      fireEvent.keyDown(subjects, { key: "ArrowRight" });
      expect(courses).toHaveFocus();
      fireEvent.keyDown(courses, { key: "End" });
      expect(within(tabs).getByRole("tab", { name: "Departamentos y períodos" })).toHaveFocus();

      fireEvent.click(courses);
      expect(courses).toHaveAttribute("aria-selected", "true");
      expect(await screen.findByRole("tabpanel", { name: "Cursos" })).toBeInTheDocument();
      expect(replace).toHaveBeenLastCalledWith("/admin/catalogo?vista=cursos", { scroll: false });
    });

    it("opens the tab named in the URL", async () => {
      searchParams = new URLSearchParams("vista=cursos&sin-monitores=1");
      await renderAdmin();

      expect(screen.getByRole("tab", { name: "Cursos" })).toHaveAttribute("aria-selected", "true");
      await waitFor(() =>
        expect(listCoursesMock).toHaveBeenCalledWith(
          1,
          { ...NO_COURSE_FILTERS, withoutMonitors: true },
          expect.any(AbortSignal),
        ),
      );
    });

    it("lists the courses without a teacher from their coverage figure", async () => {
      await renderAdmin();

      fireEvent.click(await screen.findByRole("button", { name: /Sin docente/ }));

      expect(screen.getByRole("tab", { name: "Cursos" })).toHaveAttribute("aria-selected", "true");
      await waitFor(() =>
        expect(listCoursesMock).toHaveBeenLastCalledWith(
          1,
          { ...NO_COURSE_FILTERS, term: "2026-2", withoutTeacher: true },
          expect.any(AbortSignal),
        ),
      );
      expect(replace).toHaveBeenLastCalledWith(
        "/admin/catalogo?vista=cursos&periodo=2026-2&sin-docente=1",
        { scroll: false },
      );
      expect(screen.getByRole("button", { name: "Sin docente" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    it("reports a summary failure without hiding the tabs", async () => {
      vi.mocked(getCatalogSummary).mockRejectedValueOnce(
        new ApiError(0, "down", { detail: "Sin conexión." }),
      );
      await renderAdmin();

      expect(await screen.findByText("Sin conexión.")).toBeInTheDocument();
      expect(screen.getByRole("tablist")).toBeInTheDocument();
    });
  });

  describe("subjects", () => {
    it("lists subjects densely with their monitors and status", async () => {
      await renderAdmin();

      const table = await screen.findByRole("table");
      const rows = within(table).getAllByRole("row");
      expect(within(rows[0]!).getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
        "Código",
        "Asignatura",
        "Departamento",
        "Créditos",
        "Monitores",
        "Estado",
      ]);
      expect(rows[1]).toHaveTextContent("MAT-101");
      expect(rows[1]).toHaveTextContent("Cálculo diferencial");
      expect(rows[1]).toHaveTextContent("Activa");
      expect(rows[2]).toHaveTextContent("Inactiva");
      expect(screen.getByText("2 asignaturas")).toBeInTheDocument();
      expect(listSubjectsMock).toHaveBeenCalledWith(1, NO_SUBJECT_FILTERS, expect.any(AbortSignal));
    });

    it("filters by department and status", async () => {
      await renderAdmin();
      const toolbar = await screen.findByRole("search", { name: "Filtrar asignaturas" });
      await within(toolbar).findByRole("option", { name: "Física" });

      fireEvent.change(within(toolbar).getByLabelText("Departamento"), { target: { value: "FIS" } });
      fireEvent.change(within(toolbar).getByLabelText("Estado"), {
        target: { value: "inactivas" },
      });

      await waitFor(() =>
        expect(listSubjectsMock).toHaveBeenLastCalledWith(
          1,
          { ...NO_SUBJECT_FILTERS, department: "FIS", active: false },
          expect.any(AbortSignal),
        ),
      );
      expect(replace).toHaveBeenLastCalledWith(
        "/admin/catalogo?vista=asignaturas&departamento=FIS&estado=inactivas",
        { scroll: false },
      );
    });

    it("creates a subject from the drawer", async () => {
      createSubjectMock.mockResolvedValue({ ...CALCULO, id: 3, code: "FIS-101", name: "Mecánica" });
      await renderAdmin();
      await screen.findByRole("table");

      fireEvent.click(screen.getByRole("button", { name: "Nueva asignatura" }));
      const form = drawer("Nueva asignatura");
      await within(form).findByRole("option", { name: "Física" });
      expect(within(form).queryByRole("option", { name: /Química/ })).not.toBeInTheDocument();
      fireEvent.change(within(form).getByLabelText("Código"), { target: { value: "fis-101" } });
      fireEvent.change(within(form).getByLabelText("Nombre"), { target: { value: " Mecánica " } });
      fireEvent.change(within(form).getByLabelText("Departamento"), { target: { value: "2" } });
      fireEvent.change(within(form).getByLabelText("Créditos"), { target: { value: "3" } });
      fireEvent.click(within(form).getByRole("button", { name: "Crear asignatura" }));

      await waitFor(() =>
        expect(createSubjectMock).toHaveBeenCalledWith({
          code: "FIS-101",
          name: "Mecánica",
          department: 2,
          credits: 3,
          is_active: true,
        }),
      );
      expect(await screen.findByRole("status")).toHaveTextContent("Se creó la asignatura FIS-101.");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Nueva asignatura" })).toHaveFocus();
    });

    it("asks for the missing fields before sending", async () => {
      await renderAdmin();
      await screen.findByRole("table");

      fireEvent.click(screen.getByRole("button", { name: "Nueva asignatura" }));
      const form = drawer("Nueva asignatura");
      fireEvent.click(within(form).getByRole("button", { name: "Crear asignatura" }));

      expect(within(form).getByText("Ingresa el código.")).toBeInTheDocument();
      expect(within(form).getByText("Ingresa el nombre.")).toBeInTheDocument();
      expect(within(form).getByText("Elige el departamento.")).toBeInTheDocument();
      expect(within(form).getByText("Ingresa un número entero de créditos.")).toBeInTheDocument();
      expect(createSubjectMock).not.toHaveBeenCalled();
    });

    it("shows the API's field errors next to each field", async () => {
      createSubjectMock.mockRejectedValue(
        new ApiError(400, "invalid", { code: ["Ya existe una asignatura con este código."] }),
      );
      await renderAdmin();
      await screen.findByRole("table");

      fireEvent.click(screen.getByRole("button", { name: "Nueva asignatura" }));
      const form = drawer("Nueva asignatura");
      await within(form).findByRole("option", { name: "Matemáticas" });
      fireEvent.change(within(form).getByLabelText("Código"), { target: { value: "MAT-101" } });
      fireEvent.change(within(form).getByLabelText("Nombre"), { target: { value: "Cálculo" } });
      fireEvent.change(within(form).getByLabelText("Departamento"), { target: { value: "1" } });
      fireEvent.change(within(form).getByLabelText("Créditos"), { target: { value: "4" } });
      fireEvent.click(within(form).getByRole("button", { name: "Crear asignatura" }));

      expect(
        await within(form).findByText("Ya existe una asignatura con este código."),
      ).toBeInTheDocument();
      expect(within(form).getByLabelText("Código")).toHaveAttribute("aria-invalid", "true");
    });

    it("edits a subject and deactivates it", async () => {
      updateSubjectMock.mockResolvedValue({ ...CALCULO, is_active: false });
      await renderAdmin();
      await screen.findByRole("table");

      fireEvent.click(screen.getByRole("button", { name: /Cálculo diferencial/ }));
      const form = drawer("Editar asignatura");
      expect(within(form).getByLabelText("Nombre")).toHaveValue("Cálculo diferencial");
      const active = within(form).getByRole("checkbox", { name: "Asignatura activa" });
      expect(active).toBeChecked();
      fireEvent.click(active);
      fireEvent.click(within(form).getByRole("button", { name: "Guardar cambios" }));

      await waitFor(() => expect(updateSubjectMock).toHaveBeenCalledWith(1, { is_active: false }));
      expect(await screen.findByRole("status")).toHaveTextContent(
        "Se guardaron los cambios de MAT-101.",
      );
    });
  });
});
