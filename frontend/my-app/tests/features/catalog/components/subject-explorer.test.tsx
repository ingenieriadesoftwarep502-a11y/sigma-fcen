import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SubjectExplorer from "@/features/catalog/components/subject-explorer";
import { pinnedKey } from "@/features/catalog/pinned-subjects";
import { SessionProvider } from "@/features/auth/session/session-provider";
import { ApiError } from "@/lib/api-client";
import { getCurrentUser } from "@/lib/auth";
import {
  getCurrentTerm,
  getSubject,
  listAllDepartments,
  listAllTerms,
  listSubjects,
  NO_SUBJECT_FILTERS,
  type Subject,
  type SubjectPage,
} from "@/lib/catalog";

const replace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/asignaturas",
  useSearchParams: () => searchParams,
}));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/catalog")>()),
  listSubjects: vi.fn(),
  getSubject: vi.fn(),
  listAllDepartments: vi.fn(),
  listAllTerms: vi.fn(),
  getCurrentTerm: vi.fn(),
}));

const USER_ID = "3f0c2b1e-0000-4000-8000-000000000009";
const MAT = { id: 1, code: "MAT", name: "Matemáticas" };
const FIS = { id: 2, code: "FIS", name: "Física" };
const TERM_2 = { id: 2, code: "2026-2", start_date: "2026-08-01", end_date: "2026-12-10" };
const TERM_1 = { id: 1, code: "2026-1", start_date: "2026-02-01", end_date: "2026-06-10" };

function subject(id: number, name: string, extra: Partial<Subject> = {}): Subject {
  return {
    id,
    code: `MAT-${100 + id}`,
    name,
    credits: 4,
    is_active: true,
    department: MAT,
    monitor_count: 0,
    ...extra,
  };
}

const CALCULO = subject(1, "Cálculo diferencial", { monitor_count: 3 });
const ALGEBRA = subject(2, "Álgebra lineal", { credits: 3 });
const MECANICA = subject(3, "Mecánica", { department: FIS, code: "FIS-101", monitor_count: 1 });

function pageOf(results: Subject[], extra: Partial<SubjectPage> = {}): SubjectPage {
  return { count: results.length, next: null, previous: null, results, ...extra };
}

const listSubjectsMock = vi.mocked(listSubjects);
const getSubjectMock = vi.mocked(getSubject);

async function renderExplorer(page: SubjectPage = pageOf([CALCULO, ALGEBRA])) {
  listSubjectsMock.mockResolvedValue(page);
  render(
    <SessionProvider>
      <SubjectExplorer />
    </SessionProvider>,
  );
  await screen.findByRole("heading", { name: "Asignaturas", level: 1 });
}

function results() {
  return screen.getByRole("list", { name: "Resultados" });
}

function lastFilters() {
  return listSubjectsMock.mock.lastCall?.[1];
}

describe("SubjectExplorer", () => {
  beforeEach(() => {
    searchParams = new URLSearchParams();
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: USER_ID,
      email: "sofia@unal.edu.co",
      first_name: "Sofía",
      last_name: "Ríos",
      roles: ["STUDENT"],
    });
    vi.mocked(listAllDepartments).mockResolvedValue([MAT, FIS]);
    vi.mocked(listAllTerms).mockResolvedValue([TERM_2, TERM_1]);
    vi.mocked(getCurrentTerm).mockResolvedValue(TERM_2);
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("shows each subject with its department, credits and monitors this term", async () => {
    await renderExplorer();

    const cards = await within(await screen.findByRole("list", { name: "Resultados" })).findAllByRole(
      "listitem",
    );
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent("Cálculo diferencial");
    expect(cards[0]).toHaveTextContent("MAT-101");
    expect(cards[0]).toHaveTextContent("Matemáticas");
    expect(cards[0]).toHaveTextContent("4 créditos");
    expect(cards[0]).toHaveTextContent("3 monitores");
    expect(cards[1]).toHaveTextContent("Sin monitores este período");
    expect(screen.getByText("Mostrando 2 de 2 asignaturas")).toBeInTheDocument();
    expect(listSubjectsMock).toHaveBeenCalledWith(1, NO_SUBJECT_FILTERS, expect.any(AbortSignal));
  });

  it("searches by code or name after a short pause and keeps it in the URL", async () => {
    await renderExplorer();
    await screen.findByRole("list", { name: "Resultados" });

    listSubjectsMock.mockResolvedValue(pageOf([CALCULO]));
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar asignaturas" }), {
      target: { value: "cálc" },
    });

    await waitFor(() => expect(lastFilters()?.search).toBe("cálc"));
    expect(replace).toHaveBeenLastCalledWith("/asignaturas?q=c%C3%A1lc", { scroll: false });
  });

  it("filters by one department at a time, with Todos to undo it", async () => {
    await renderExplorer();
    const departments = await screen.findByRole("group", { name: "Departamento" });
    const all = within(departments).getByRole("button", { name: "Todos" });
    const fisica = await within(departments).findByRole("button", { name: "Física" });
    expect(all).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(fisica);
    expect(fisica).toHaveAttribute("aria-pressed", "true");
    expect(all).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(lastFilters()?.department).toBe("FIS"));

    fireEvent.click(all);
    await waitFor(() => expect(lastFilters()?.department).toBeNull());
  });

  it("narrows to subjects with monitors and by credits", async () => {
    await renderExplorer();
    await screen.findByRole("list", { name: "Resultados" });

    const withMonitors = screen.getByRole("button", { name: "Con monitores disponibles" });
    fireEvent.click(withMonitors);
    expect(withMonitors).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(lastFilters()?.hasMonitors).toBe(true));

    fireEvent.change(screen.getByLabelText("Créditos"), { target: { value: "3" } });
    await waitFor(() => expect(lastFilters()?.credits).toBe(3));
  });

  it("counts monitors in another term when the person switches it", async () => {
    await renderExplorer();
    const term = await screen.findByLabelText("Período");
    await waitFor(() => expect(term).toHaveValue("2026-2"));
    expect(within(term).getByRole("option", { name: "2026-2 (actual)" })).toBeInTheDocument();

    fireEvent.change(term, { target: { value: "2026-1" } });

    await waitFor(() => expect(lastFilters()?.term).toBe("2026-1"));
    expect(replace).toHaveBeenLastCalledWith("/asignaturas?periodo=2026-1", { scroll: false });
  });

  it("loads the next page on demand and appends it", async () => {
    await renderExplorer(pageOf([CALCULO, ALGEBRA], { count: 3, next: "page=2" }));
    await screen.findByRole("list", { name: "Resultados" });
    expect(screen.getByText("Mostrando 2 de 3 asignaturas")).toBeInTheDocument();

    listSubjectsMock.mockResolvedValue(pageOf([MECANICA], { count: 3, previous: "page=1" }));
    fireEvent.click(screen.getByRole("button", { name: "Cargar más" }));

    await waitFor(() => expect(within(results()).getAllByRole("listitem")).toHaveLength(3));
    expect(listSubjectsMock).toHaveBeenLastCalledWith(2, NO_SUBJECT_FILTERS, expect.any(AbortSignal));
    expect(screen.getByText("Mostrando 3 de 3 asignaturas")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cargar más" })).not.toBeInTheDocument();
  });

  it("suggests clearing the filters when nothing matches", async () => {
    searchParams = new URLSearchParams("q=zzz&monitores=1");
    await renderExplorer(pageOf([]));

    expect(await screen.findByText("Ninguna asignatura coincide.")).toBeInTheDocument();
    listSubjectsMock.mockResolvedValue(pageOf([CALCULO]));
    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));

    await waitFor(() => expect(lastFilters()).toEqual({ ...NO_SUBJECT_FILTERS }));
    expect(screen.getByRole("searchbox", { name: "Buscar asignaturas" })).toHaveValue("");
  });

  it("reports a failure and tries again", async () => {
    listSubjectsMock.mockRejectedValueOnce(new ApiError(0, "down", { detail: "Sin conexión." }));
    await renderExplorer();

    expect(await screen.findByText("Sin conexión.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Intentar de nuevo" }));

    expect(await screen.findByRole("list", { name: "Resultados" })).toBeInTheDocument();
  });

  it("pins a subject to Mis asignaturas and remembers it for this person", async () => {
    getSubjectMock.mockResolvedValue(CALCULO);
    await renderExplorer();
    const card = (await within(await screen.findByRole("list", { name: "Resultados" })).findAllByRole(
      "listitem",
    ))[0]!;

    const pin = within(card).getByRole("button", { name: "Fijar Cálculo diferencial en Mis asignaturas" });
    expect(pin).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(pin);

    expect(pin).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem(pinnedKey(USER_ID))).toBe("[1]");
    const mine = await screen.findByRole("region", { name: "Mis asignaturas" });
    expect(await within(mine).findByText("Cálculo diferencial")).toBeInTheDocument();
    expect(getSubjectMock).toHaveBeenCalledWith(1, null, expect.any(AbortSignal));
  });

  it("shows the pinned subjects on arrival and unpins them", async () => {
    localStorage.setItem(pinnedKey(USER_ID), "[3]");
    getSubjectMock.mockResolvedValue(MECANICA);
    await renderExplorer();

    const mine = await screen.findByRole("region", { name: "Mis asignaturas" });
    expect(await within(mine).findByText("Mecánica")).toBeInTheDocument();

    fireEvent.click(within(mine).getByRole("button", { name: "Fijar Mecánica en Mis asignaturas" }));

    expect(screen.queryByRole("region", { name: "Mis asignaturas" })).not.toBeInTheDocument();
    expect(localStorage.getItem(pinnedKey(USER_ID))).toBe("[]");
  });
});
