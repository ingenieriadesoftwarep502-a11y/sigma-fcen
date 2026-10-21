import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MyCourses from "@/features/catalog/components/my-courses";
import { ApiError } from "@/lib/api-client";
import {
  getCurrentTerm,
  listAllTerms,
  listMyCourses,
  type TeacherCourse,
} from "@/lib/catalog";

const replace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/mis-cursos",
  useSearchParams: () => searchParams,
}));
vi.mock("@/lib/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/catalog")>()),
  listMyCourses: vi.fn(),
  listAllTerms: vi.fn(),
  getCurrentTerm: vi.fn(),
}));

const TERM_2 = { id: 2, code: "2026-2", start_date: "2026-08-01", end_date: "2026-12-10" };
const TERM_1 = { id: 1, code: "2026-1", start_date: "2026-02-01", end_date: "2026-06-10" };
const MAT = { id: 1, code: "MAT", name: "Matemáticas" };

const CALCULO: TeacherCourse = {
  id: 10,
  subject: { id: 1, code: "MAT-101", name: "Cálculo diferencial", credits: 4, department: MAT },
  term: "2026-2",
  group: "2",
  monitors: [
    { id: "m-1", full_name: "Ana Pérez", email: "ana@unal.edu.co", committed_hours: 6 },
    { id: "m-2", full_name: "Luis Gómez", email: "luis@unal.edu.co", committed_hours: 4 },
  ],
};
const ALGEBRA: TeacherCourse = {
  id: 11,
  subject: { id: 2, code: "MAT-102", name: "Álgebra lineal", credits: 3, department: MAT },
  term: "2026-2",
  group: "1",
  monitors: [],
};

const listMyCoursesMock = vi.mocked(listMyCourses);

describe("MyCourses (T-02.8)", () => {
  beforeEach(() => {
    searchParams = new URLSearchParams();
    vi.mocked(listAllTerms).mockResolvedValue([TERM_2, TERM_1]);
    vi.mocked(getCurrentTerm).mockResolvedValue(TERM_2);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows each course with its monitors and their committed hours", async () => {
    listMyCoursesMock.mockResolvedValue([CALCULO, ALGEBRA]);
    render(<MyCourses />);

    const calculo = await screen.findByRole("article", { name: /Cálculo diferencial/ });
    expect(calculo).toHaveTextContent("MAT-101");
    expect(calculo).toHaveTextContent("Grupo 2");
    expect(calculo).toHaveTextContent("Matemáticas");
    const monitors = within(calculo).getByRole("list", { name: "Monitores de Cálculo diferencial" });
    expect(within(monitors).getAllByRole("listitem")).toHaveLength(2);
    expect(monitors).toHaveTextContent("Ana Pérez");
    expect(monitors).toHaveTextContent("ana@unal.edu.co");
    expect(monitors).toHaveTextContent("6 h");
    expect(calculo).toHaveTextContent("10 h comprometidas en total");

    const algebra = screen.getByRole("article", { name: /Álgebra lineal/ });
    expect(algebra).toHaveTextContent("Aún no hay monitores asignados");
    expect(listMyCoursesMock).toHaveBeenCalledWith(null, expect.any(AbortSignal));
  });

  it("switches to another term and keeps it in the URL", async () => {
    listMyCoursesMock.mockResolvedValue([CALCULO]);
    render(<MyCourses />);
    const term = await screen.findByLabelText("Período");
    await waitFor(() => expect(term).toHaveValue("2026-2"));

    listMyCoursesMock.mockResolvedValue([]);
    fireEvent.change(term, { target: { value: "2026-1" } });

    await waitFor(() => expect(listMyCoursesMock).toHaveBeenLastCalledWith("2026-1", expect.any(AbortSignal)));
    expect(replace).toHaveBeenLastCalledWith("/mis-cursos?periodo=2026-1", { scroll: false });
    expect(await screen.findByText("No tienes cursos en este período.")).toBeInTheDocument();
  });

  it("reports a failure and tries again", async () => {
    listMyCoursesMock.mockRejectedValueOnce(new ApiError(0, "down", { detail: "Sin conexión." }));
    listMyCoursesMock.mockResolvedValueOnce([ALGEBRA]);
    render(<MyCourses />);

    expect(await screen.findByText("Sin conexión.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Intentar de nuevo" }));

    expect(await screen.findByRole("article", { name: /Álgebra lineal/ })).toBeInTheDocument();
  });
});
