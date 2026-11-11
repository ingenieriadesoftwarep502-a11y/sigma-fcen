import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TeachingPanel from "@/features/teaching/components/teaching-panel";
import { ApiError } from "@/lib/api-client";
import { getCurrentTerm, listAllTerms } from "@/lib/catalog";
import {
  listCourseMonitors,
  listCourseSessions,
  listCourseStudents,
  listFrequentTopics,
  listTeachingCourses,
} from "@/lib/teaching";

import { pageOf } from "../availability/fixtures";
import {
  ALGEBRA_COURSE,
  frequentTopic,
  teachingCourse,
  teachingMonitor,
  teachingSession,
  teachingStudent,
} from "./fixtures";

const replace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/seguimiento",
  useSearchParams: () => searchParams,
}));
vi.mock("@/lib/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/catalog")>()),
  listAllTerms: vi.fn(),
  getCurrentTerm: vi.fn(),
}));
vi.mock("@/lib/teaching", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/teaching")>()),
  listTeachingCourses: vi.fn(),
  listCourseMonitors: vi.fn(),
  listCourseStudents: vi.fn(),
  listFrequentTopics: vi.fn(),
  listCourseSessions: vi.fn(),
}));

const TERM_2 = { id: 2, code: "2026-2", start_date: "2026-08-01", end_date: "2026-12-10" };
const TERM_1 = { id: 1, code: "2026-1", start_date: "2026-02-01", end_date: "2026-06-10" };
const CALCULO = teachingCourse();

const sessionsMock = vi.mocked(listCourseSessions);

describe("TeachingPanel (T-08.11, HU-09)", () => {
  beforeEach(() => {
    searchParams = new URLSearchParams();
    vi.mocked(listAllTerms).mockResolvedValue([TERM_2, TERM_1]);
    vi.mocked(getCurrentTerm).mockResolvedValue(TERM_2);
    vi.mocked(listTeachingCourses).mockResolvedValue([CALCULO, ALGEBRA_COURSE]);
    vi.mocked(listCourseMonitors).mockResolvedValue([teachingMonitor()]);
    vi.mocked(listCourseStudents).mockResolvedValue(
      pageOf([teachingStudent(), teachingStudent({ full_name: "Luis Gómez", session_count: 1 })]),
    );
    vi.mocked(listFrequentTopics).mockResolvedValue([
      frequentTopic(),
      frequentTopic({ id: "t-2", name: "Derivadas", session_count: 4 }),
    ]);
    sessionsMock.mockResolvedValue(pageOf([teachingSession()]));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("selects the first course and shows its indicators", async () => {
    render(<TeachingPanel />);

    const figures = await screen.findByRole("region", { name: "Indicadores del curso" });
    expect(within(figures).getByText("Sesiones realizadas").nextSibling).toHaveTextContent("24");
    expect(within(figures).getByText("Estudiantes atendidos").nextSibling).toHaveTextContent(
      "18",
    );
    expect(within(figures).getByText("Monitores asignados").nextSibling).toHaveTextContent("1");
    expect(screen.getByRole("combobox", { name: "Curso" })).toHaveValue("10");
    expect(listTeachingCourses).toHaveBeenCalledWith(null, expect.any(AbortSignal));
  });

  it("asks the server for the selected course only", async () => {
    render(<TeachingPanel />);

    await screen.findByRole("region", { name: "Indicadores del curso" });
    await waitFor(() => expect(listCourseMonitors).toHaveBeenCalledWith(10, expect.anything()));
    expect(listCourseStudents).toHaveBeenCalledWith(10, expect.anything());
    expect(listFrequentTopics).toHaveBeenCalledWith(10, expect.anything());
    expect(sessionsMock).toHaveBeenCalledWith(
      1,
      { course: 10, dateFrom: null, dateTo: null },
      expect.anything(),
    );
  });

  it("lists the frequent topics, most repeated first (RF-083)", async () => {
    render(<TeachingPanel />);

    const topics = await screen.findByRole("list", { name: "Dificultades frecuentes" });
    const items = within(topics).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Límites laterales");
    expect(items[0]).toHaveTextContent("9 sesiones");
    expect(items[1]).toHaveTextContent("Derivadas");
  });

  it("lists the course's monitors and the students who attended", async () => {
    render(<TeachingPanel />);

    const monitors = await screen.findByRole("list", { name: "Monitores del curso" });
    expect(within(monitors).getByText("Sofía Díaz")).toBeInTheDocument();
    expect(within(monitors).getByRole("link", { name: "sofia.diaz@unal.edu.co" })).toHaveAttribute(
      "href",
      "mailto:sofia.diaz@unal.edu.co",
    );
    const students = await screen.findByRole("list", { name: "Estudiantes atendidos" });
    expect(within(students).getAllByRole("listitem")).toHaveLength(2);
    expect(students).toHaveTextContent("Ana Pérez");
    expect(students).toHaveTextContent("3 sesiones");
    expect(students).toHaveTextContent("1 sesión");
  });

  it("switches course and keeps it in the URL", async () => {
    render(<TeachingPanel />);
    await screen.findByRole("region", { name: "Indicadores del curso" });

    fireEvent.change(screen.getByRole("combobox", { name: "Curso" }), { target: { value: "11" } });

    await waitFor(() => expect(listCourseMonitors).toHaveBeenCalledWith(11, expect.anything()));
    expect(replace).toHaveBeenLastCalledWith("/seguimiento?curso=11", { scroll: false });
  });

  it("opens the course named in the URL", async () => {
    searchParams = new URLSearchParams("curso=11");
    render(<TeachingPanel />);

    await waitFor(() => expect(listCourseMonitors).toHaveBeenCalledWith(11, expect.anything()));
    expect(screen.getByRole("combobox", { name: "Curso" })).toHaveValue("11");
  });

  it("shows empty sections for a course without sessions (T-08.7)", async () => {
    vi.mocked(listTeachingCourses).mockResolvedValue([ALGEBRA_COURSE]);
    vi.mocked(listCourseMonitors).mockResolvedValue([]);
    vi.mocked(listCourseStudents).mockResolvedValue(pageOf([]));
    vi.mocked(listFrequentTopics).mockResolvedValue([]);
    sessionsMock.mockResolvedValue(pageOf([]));

    render(<TeachingPanel />);

    expect(
      await screen.findByText("Aún no hay temas registrados en las sesiones de este curso."),
    ).toBeInTheDocument();
    expect(screen.getByText("Aún no hay monitores asignados a este curso.")).toBeInTheDocument();
    expect(screen.getByText("Ningún estudiante ha asistido todavía.")).toBeInTheDocument();
    expect(await screen.findByText("No hay sesiones registradas en este curso.")).toBeInTheDocument();
  });

  it("tells a teacher without courses what to do", async () => {
    vi.mocked(listTeachingCourses).mockResolvedValue([]);

    render(<TeachingPanel />);

    expect(await screen.findByText("No tienes cursos en este período.")).toBeInTheDocument();
    expect(listCourseMonitors).not.toHaveBeenCalled();
    expect(sessionsMock).not.toHaveBeenCalled();
  });

  it("changes term and reloads the courses", async () => {
    render(<TeachingPanel />);
    await screen.findByRole("region", { name: "Indicadores del curso" });

    fireEvent.change(await screen.findByRole("combobox", { name: "Período" }), {
      target: { value: "2026-1" },
    });

    await waitFor(() =>
      expect(listTeachingCourses).toHaveBeenLastCalledWith("2026-1", expect.any(AbortSignal)),
    );
    expect(replace).toHaveBeenLastCalledWith("/seguimiento?periodo=2026-1", { scroll: false });
  });

  it("shows a failure with a retry", async () => {
    vi.mocked(listTeachingCourses).mockRejectedValueOnce(
      new ApiError(403, "Forbidden", { detail: "Solo puedes consultar tus propios cursos." }),
    );

    render(<TeachingPanel />);

    expect(await screen.findByText("Solo puedes consultar tus propios cursos.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Intentar de nuevo" }));
    expect(await screen.findByRole("region", { name: "Indicadores del curso" })).toBeInTheDocument();
  });
});

describe("Course sessions table (T-08.12)", () => {
  beforeEach(() => {
    searchParams = new URLSearchParams();
    vi.mocked(listAllTerms).mockResolvedValue([TERM_2]);
    vi.mocked(getCurrentTerm).mockResolvedValue(TERM_2);
    vi.mocked(listTeachingCourses).mockResolvedValue([CALCULO]);
    vi.mocked(listCourseMonitors).mockResolvedValue([]);
    vi.mocked(listCourseStudents).mockResolvedValue(pageOf([]));
    vi.mocked(listFrequentTopics).mockResolvedValue([]);
    sessionsMock.mockResolvedValue(pageOf([teachingSession()]));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows date, monitor, students and topics of each session (CA-HU09-2)", async () => {
    render(<TeachingPanel />);

    const table = await screen.findByRole("table");
    const row = within(table).getAllByRole("row")[1]!;
    expect(row).toHaveTextContent("15 sept 2026");
    expect(row).toHaveTextContent("Sofía Díaz");
    expect(row).toHaveTextContent("Ana Pérez, Luis Gómez");
    expect(row).toHaveTextContent("Límites laterales");
  });

  it("filters by date range on the server", async () => {
    render(<TeachingPanel />);
    await screen.findByRole("table");

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-09-30" } });

    await waitFor(() =>
      expect(sessionsMock).toHaveBeenLastCalledWith(
        1,
        { course: 10, dateFrom: "2026-09-01", dateTo: "2026-09-30" },
        expect.anything(),
      ),
    );
  });

  it("does not ask for an inverted range and explains why", async () => {
    render(<TeachingPanel />);
    await screen.findByRole("table");
    const calls = sessionsMock.mock.calls.length;

    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-09-10" } });

    expect(
      await screen.findByText("La fecha final no puede ser anterior a la inicial."),
    ).toBeInTheDocument();
    const last = sessionsMock.mock.calls.at(-1)!;
    expect(last[1]).toEqual({ course: 10, dateFrom: null, dateTo: "2026-09-01" });
    expect(sessionsMock.mock.calls.length).toBe(calls + 1);
  });

  it("pages through the sessions", async () => {
    sessionsMock.mockResolvedValue({
      count: 12,
      next: "http://api.test/next",
      previous: null,
      results: [teachingSession()],
    });
    render(<TeachingPanel />);
    await screen.findByRole("table");

    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    await waitFor(() =>
      expect(sessionsMock).toHaveBeenLastCalledWith(
        2,
        { course: 10, dateFrom: null, dateTo: null },
        expect.anything(),
      ),
    );
    expect(await screen.findByText("Página 2 de 2")).toBeInTheDocument();
  });
});
