import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionProvider } from "@/features/auth/session/session-provider";
import SubjectDetail from "@/features/catalog/components/subject-detail";
import { pinnedKey } from "@/features/catalog/pinned-subjects";
import { ApiError } from "@/lib/api-client";
import { getCurrentUser } from "@/lib/auth";
import { NO_SLOT_SEARCH_FILTERS, searchSlots } from "@/lib/availability";
import { getCurrentTerm, getSubject, listAllTerms, listSubjectMonitors } from "@/lib/catalog";

import { CALCULO_REF, INDIVIDUAL_SLOT, pageOf, TERM_1, TERM_2 } from "../../availability/fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/asignaturas/1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/catalog")>()),
  getSubject: vi.fn(),
  listSubjectMonitors: vi.fn(),
  listAllTerms: vi.fn(),
  getCurrentTerm: vi.fn(),
}));
vi.mock("@/lib/availability", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/availability")>()),
  searchSlots: vi.fn(),
}));

const USER_ID = "3f0c2b1e-0000-4000-8000-000000000009";
const CALCULO = {
  ...CALCULO_REF,
  credits: 4,
  is_active: true,
  department: { id: 1, code: "MAT", name: "Matemáticas" },
  monitor_count: 2,
};
// Luis has slots and Ana none: the roster puts the soonest help first.
const MONITORS = [
  { id: "m-1", full_name: "Ana Pérez", upcoming_slots: 0, next_slot_at: null },
  {
    id: "m-2",
    full_name: "Luis Rojas",
    upcoming_slots: 3,
    next_slot_at: INDIVIDUAL_SLOT.starts_at,
  },
];

const getSubjectMock = vi.mocked(getSubject);
const monitorsMock = vi.mocked(listSubjectMonitors);
const searchMock = vi.mocked(searchSlots);

function renderDetail() {
  render(
    <SessionProvider>
      <SubjectDetail subjectId={1} />
    </SessionProvider>,
  );
}

describe("SubjectDetail", () => {
  beforeEach(() => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: USER_ID,
      email: "ana.perez@unal.edu.co",
      first_name: "Ana",
      last_name: "Pérez",
      roles: ["STUDENT"],
    });
    vi.mocked(listAllTerms).mockResolvedValue([TERM_2, TERM_1]);
    vi.mocked(getCurrentTerm).mockResolvedValue(TERM_2);
    getSubjectMock.mockResolvedValue(CALCULO);
    monitorsMock.mockResolvedValue(MONITORS);
    searchMock.mockResolvedValue(pageOf([INDIVIDUAL_SLOT]));
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("shows what the subject is, with a way back to the catalog", async () => {
    renderDetail();

    expect(
      await screen.findByRole("heading", {
        name: "Cálculo diferencial",
        level: 1,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("MAT-101")).toBeInTheDocument();
    expect(screen.getByText("4 créditos")).toBeInTheDocument();
    expect(screen.getByText("Matemáticas")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Asignaturas/ })).toHaveAttribute(
      "href",
      "/asignaturas",
    );
    expect(getSubjectMock).toHaveBeenCalledWith(1, null, expect.any(AbortSignal));
  });

  it("lists the monitors of the current term, soonest available first", async () => {
    renderDetail();

    const monitors = await screen.findByRole("list", {
      name: "Monitores de Cálculo diferencial",
    });
    const items = within(monitors).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Luis Rojas");
    expect(items[0]).toHaveTextContent("3franjas");
    expect(items[0]).toHaveTextContent("Próxima:");
    expect(items[1]).toHaveTextContent("Ana Pérez");
    expect(items[1]).toHaveTextContent("Sin franjas por ahora");
    expect(await screen.findByText("Monitores del período 2026-2")).toBeInTheDocument();
    expect(screen.getByText("2 monitores · 3 franjas disponibles")).toBeInTheDocument();
    expect(monitorsMock).toHaveBeenCalledWith(1, expect.any(AbortSignal));
  });

  it("says when the subject has no monitors this term", async () => {
    monitorsMock.mockResolvedValue([]);
    renderDetail();

    expect(
      await screen.findByText("Esta asignatura no tiene monitores en el período."),
    ).toBeInTheDocument();
  });

  it("keeps slots out of the page until a monitor is chosen", async () => {
    renderDetail();

    await screen.findByRole("list", {
      name: "Monitores de Cálculo diferencial",
    });
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("opens the chosen monitor's slots in a panel, and closes it back to the monitor", async () => {
    renderDetail();

    const opener = await screen.findByRole("button", {
      name: "Ver las franjas de Luis Rojas",
    });
    fireEvent.click(opener);

    const panel = await screen.findByRole("dialog", { name: "Luis Rojas" });
    expect(await within(panel).findByText("1 franja disponible")).toBeInTheDocument();
    expect(searchMock).toHaveBeenCalledWith(
      1,
      {
        ...NO_SLOT_SEARCH_FILTERS,
        term: "2026-2",
        subject: CALCULO_REF,
        monitor: { id: "m-2", name: "Luis Rojas" },
      },
      expect.any(AbortSignal),
    );
    expect(screen.queryByRole("button", { name: /Reservar/ })).not.toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: "Cerrar panel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("finds a monitor by name when the subject has many", async () => {
    monitorsMock.mockResolvedValue(
      [
        "Ana Pérez",
        "Luis Rojas",
        "Sofía Díaz",
        "Andrés Mora",
        "Olga Ruiz",
        "Iván Gil",
        "José Peña",
      ].map((full_name, index) => ({
        id: `m-${index}`,
        full_name,
        upcoming_slots: 0,
        next_slot_at: null,
      })),
    );
    renderDetail();

    fireEvent.change(await screen.findByLabelText("Buscar monitor"), {
      target: { value: "sofia" },
    });

    const monitors = screen.getByRole("list", {
      name: "Monitores de Cálculo diferencial",
    });
    expect(within(monitors).getAllByRole("listitem")).toHaveLength(1);
    expect(monitors).toHaveTextContent("Sofía Díaz");
  });

  it("pins the subject to Mis asignaturas", async () => {
    renderDetail();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Fijar Cálculo diferencial en Mis asignaturas",
      }),
    );

    expect(localStorage.getItem(pinnedKey(USER_ID))).toBe("[1]");
  });

  it("explains when the subject does not exist or is no longer offered", async () => {
    getSubjectMock.mockRejectedValue(new ApiError(404, "Not Found", { detail: "No encontrado." }));
    renderDetail();

    expect(await screen.findByText("No encontramos esta asignatura.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a Asignaturas" })).toHaveAttribute(
      "href",
      "/asignaturas",
    );
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("reports other failures and tries again", async () => {
    getSubjectMock.mockRejectedValueOnce(new ApiError(0, "down", { detail: "Sin conexión." }));
    renderDetail();

    expect(await screen.findByText("Sin conexión.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Intentar de nuevo" }));

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Cálculo diferencial", level: 1 }),
      ).toBeInTheDocument(),
    );
  });
});
