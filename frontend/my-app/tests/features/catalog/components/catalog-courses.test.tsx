import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CatalogAdmin from "@/features/catalog/components/catalog-admin";
import {
  createCourse,
  getCatalogSummary,
  getCurrentTerm,
  listAllDepartments,
  listAllTerms,
  listCourses,
  listSubjects,
  NO_COURSE_FILTERS,
  updateCourse,
} from "@/lib/catalog";
import { listUsers } from "@/lib/users";

import {
  CALCULO,
  COURSE_WITH_TEACHER,
  COURSE_WITHOUT_TEACHER,
  FIS,
  MAT,
  pageOf,
  SUMMARY,
  TEACHER,
  TERM_1,
  TERM_2,
} from "../fixtures";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/admin/catalogo",
  useSearchParams: () => new URLSearchParams("vista=cursos"),
}));
vi.mock("@/lib/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/catalog")>()),
  getCatalogSummary: vi.fn(),
  listAllDepartments: vi.fn(),
  listAllTerms: vi.fn(),
  getCurrentTerm: vi.fn(),
  listSubjects: vi.fn(),
  listCourses: vi.fn(),
  createCourse: vi.fn(),
  updateCourse: vi.fn(),
}));
vi.mock("@/lib/users", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/users")>()),
  listUsers: vi.fn(),
}));

const listCoursesMock = vi.mocked(listCourses);
const createCourseMock = vi.mocked(createCourse);
const updateCourseMock = vi.mocked(updateCourse);
const listUsersMock = vi.mocked(listUsers);

async function renderCourses() {
  render(<CatalogAdmin />);
  return screen.findByRole("table");
}

function drawer(name: string) {
  return screen.getByRole("dialog", { name });
}

async function choose(scope: HTMLElement, label: string, typed: string, option: RegExp) {
  fireEvent.change(within(scope).getByRole("combobox", { name: label }), {
    target: { value: typed },
  });
  fireEvent.click(await within(scope).findByRole("option", { name: option }));
}

describe("CatalogAdmin courses (RF-024)", () => {
  beforeEach(() => {
    vi.mocked(getCatalogSummary).mockResolvedValue(SUMMARY);
    vi.mocked(listAllDepartments).mockResolvedValue([MAT, FIS]);
    vi.mocked(listAllTerms).mockResolvedValue([TERM_2, TERM_1]);
    vi.mocked(getCurrentTerm).mockResolvedValue(TERM_2);
    vi.mocked(listSubjects).mockResolvedValue(pageOf([CALCULO]));
    listCoursesMock.mockResolvedValue(pageOf([COURSE_WITH_TEACHER, COURSE_WITHOUT_TEACHER]));
    listUsersMock.mockResolvedValue(pageOf([TEACHER]));
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.style.overflow = "";
  });

  it("lists courses with their teacher, or a warning when there is none", async () => {
    const table = await renderCourses();
    const rows = within(table).getAllByRole("row");

    expect(within(rows[0]!).getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Asignatura",
      "Grupo",
      "Docente",
      "Monitores",
    ]);
    expect(rows[1]).toHaveTextContent("Marta Ruiz");
    expect(rows[2]).toHaveTextContent("Sin docente");
    expect(screen.getByText("2 cursos")).toBeInTheDocument();
  });

  it("toggles the coverage filters", async () => {
    await renderCourses();

    fireEvent.click(screen.getByRole("button", { name: "Sin monitores" }));

    await waitFor(() =>
      expect(listCoursesMock).toHaveBeenLastCalledWith(
        1,
        { ...NO_COURSE_FILTERS, withoutMonitors: true },
        expect.any(AbortSignal),
      ),
    );
    expect(replace).toHaveBeenLastCalledWith("/admin/catalogo?vista=cursos&sin-monitores=1", {
      scroll: false,
    });
  });

  it("creates a course choosing the subject and the teacher by search", async () => {
    createCourseMock.mockResolvedValue({ ...COURSE_WITH_TEACHER, id: 12, group: "3" });
    await renderCourses();

    fireEvent.click(screen.getByRole("button", { name: "Nuevo curso" }));
    const form = drawer("Nuevo curso");
    await choose(form, "Asignatura", "calc", /Cálculo diferencial/);
    await waitFor(() => expect(within(form).getByLabelText("Período")).toHaveValue("2026-2"));
    fireEvent.change(within(form).getByLabelText("Grupo"), { target: { value: "3" } });
    await choose(form, "Docente (opcional)", "luis", /Luis Gómez/);
    fireEvent.click(within(form).getByRole("button", { name: "Crear curso" }));

    await waitFor(() =>
      expect(createCourseMock).toHaveBeenCalledWith({
        subject: 1,
        term: "2026-2",
        group: "3",
        teacher: "t-2",
      }),
    );
    expect(listUsersMock).toHaveBeenCalledWith(
      1,
      { search: "luis", role: "TEACHER", isActive: true },
      expect.any(AbortSignal),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Se creó el curso MAT-101 grupo 3.",
    );
  });

  it("requires a subject chosen from the list", async () => {
    await renderCourses();

    fireEvent.click(screen.getByRole("button", { name: "Nuevo curso" }));
    const form = drawer("Nuevo curso");
    fireEvent.click(within(form).getByRole("button", { name: "Crear curso" }));

    expect(within(form).getByText("Elige una asignatura de la lista.")).toBeInTheDocument();
    expect(within(form).getByText("Ingresa el grupo.")).toBeInTheDocument();
    expect(createCourseMock).not.toHaveBeenCalled();
  });

  it("removes the teacher of a course", async () => {
    updateCourseMock.mockResolvedValue({ ...COURSE_WITH_TEACHER, teacher: null });
    await renderCourses();

    fireEvent.click(screen.getByRole("button", { name: /Cálculo diferencial/ }));
    const form = drawer("Editar curso");
    expect(within(form).getByRole("combobox", { name: "Docente (opcional)" })).toHaveValue(
      "Marta Ruiz",
    );
    fireEvent.click(within(form).getByRole("button", { name: "Quitar Docente (opcional)" }));
    fireEvent.click(within(form).getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(updateCourseMock).toHaveBeenCalledWith(10, { teacher: null }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Se guardaron los cambios del curso MAT-101 grupo 2.",
    );
  });
});
