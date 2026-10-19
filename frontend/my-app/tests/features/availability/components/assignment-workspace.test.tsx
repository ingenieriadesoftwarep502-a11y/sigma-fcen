import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AssignmentWorkspace from "@/features/availability/components/assignment-workspace";
import { createSlot, listMySlots, listMySlotsBetween, listMyTemplates } from "@/lib/availability";
import { listMyAssignments } from "@/lib/catalog";

import { CALCULO_ASSIGNMENT, GROUP_SLOT, INDIVIDUAL_SLOT, pageOf } from "../fixtures";

let searchParams = new URLSearchParams("periodo=2026-2");

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/mis-monitorias/10",
  useSearchParams: () => searchParams,
}));
vi.mock("@/lib/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/catalog")>()),
  listMyAssignments: vi.fn(),
}));
vi.mock("@/lib/availability", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/availability")>()),
  listMySlotsBetween: vi.fn(),
  listMySlots: vi.fn(),
  listMyTemplates: vi.fn(),
  createSlot: vi.fn(),
}));

const ASSIGNMENT = {
  ...CALCULO_ASSIGNMENT,
  upcoming_slots: 1,
  next_slot_at: INDIVIDUAL_SLOT.starts_at,
  active_templates: 0,
};
const weekMock = vi.mocked(listMySlotsBetween);

function renderWorkspace() {
  render(<AssignmentWorkspace assignmentId={10} />);
}

describe("AssignmentWorkspace (T-03.16, HU-05)", () => {
  beforeEach(() => {
    // Monday 19 October 2026, 09:00 in Bogotá.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T14:00:00Z"));
    searchParams = new URLSearchParams("periodo=2026-2");
    vi.mocked(listMyAssignments).mockResolvedValue([ASSIGNMENT]);
    weekMock.mockResolvedValue([INDIVIDUAL_SLOT, GROUP_SLOT]);
    vi.mocked(listMyTemplates).mockResolvedValue(pageOf([]));
    vi.mocked(listMySlots).mockResolvedValue(pageOf([INDIVIDUAL_SLOT]));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("shows the assignment and reads its week, every subject included", async () => {
    renderWorkspace();

    expect(
      await screen.findByRole("heading", { name: "Cálculo diferencial", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("6 h comprometidas")).toBeInTheDocument();
    expect(screen.getByText("1 franja disponible")).toBeInTheDocument();
    expect(screen.getByText("19 – 25 de octubre")).toBeInTheDocument();
    expect(listMyAssignments).toHaveBeenCalledWith("2026-2", expect.any(AbortSignal));
    expect(weekMock).toHaveBeenCalledWith(
      "2026-2",
      "2026-10-19",
      "2026-10-25",
      expect.any(AbortSignal),
    );
  });

  it("publishes a slot on a free hour with its date and time already filled", async () => {
    vi.mocked(createSlot).mockResolvedValue({
      ...INDIVIDUAL_SLOT,
      id: 50,
      starts_at: "2026-10-22T20:00:00Z",
      ends_at: "2026-10-22T21:00:00Z",
    });
    renderWorkspace();

    const thursday = await screen.findByRole("group", { name: "jueves, 22 de octubre" });
    fireEvent.click(
      within(thursday).getByRole("button", {
        name: "Publicar franja el jueves, 22 de octubre a las 15:00",
      }),
    );

    const drawer = screen.getByRole("dialog", { name: "Publicar franja" });
    expect(within(drawer).getByLabelText("Fecha")).toHaveValue("2026-10-22");
    expect(within(drawer).getByLabelText("Hora de inicio")).toHaveValue("15:00");
    fireEvent.change(within(drawer).getByLabelText("Aula o lugar"), {
      target: { value: "Bloque 14-203" },
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "Publicar franja" }));

    expect(await screen.findByText(/Se publicó la franja de MAT-101/)).toBeInTheDocument();
    expect(createSlot).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 1, starts_at: "2026-10-22T15:00:00-05:00" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // The week, the templates and the summary are read again.
    expect(weekMock).toHaveBeenCalledTimes(2);
    expect(listMyAssignments).toHaveBeenCalledTimes(2);
  });

  it("moves between weeks", async () => {
    renderWorkspace();

    fireEvent.click(await screen.findByRole("button", { name: "Semana siguiente" }));

    expect(await screen.findByText(/26 oct – 1 nov/)).toBeInTheDocument();
    expect(weekMock).toHaveBeenLastCalledWith(
      "2026-2",
      "2026-10-26",
      "2026-11-01",
      expect.any(AbortSignal),
    );
    fireEvent.click(screen.getByRole("button", { name: "Hoy" }));
    expect(await screen.findByText("19 – 25 de octubre")).toBeInTheDocument();
  });

  it("opens one of its slots to edit or withdraw it", async () => {
    renderWorkspace();

    const tuesday = await screen.findByRole("group", { name: "martes, 20 de octubre" });
    fireEvent.click(
      await within(tuesday).findByRole("button", { name: /^10:00–11:00, Disponible/ }),
    );

    const drawer = screen.getByRole("dialog", { name: "Franja" });
    expect(within(drawer).getByRole("button", { name: "Editar franja" })).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: "Retirar" })).toBeInTheDocument();
  });

  it("lists the upcoming slots from today in the list view", async () => {
    renderWorkspace();

    fireEvent.click(await screen.findByRole("button", { name: "Lista" }));

    expect(await screen.findByText("1 franja")).toBeInTheDocument();
    expect(listMySlots).toHaveBeenCalledWith(
      1,
      { term: "2026-2", subject: 1, status: null, dateFrom: "2026-10-19" },
      expect.any(AbortSignal),
    );
  });

  it("says when the assignment is not the monitor's", async () => {
    vi.mocked(listMyAssignments).mockResolvedValue([]);
    renderWorkspace();

    expect(await screen.findByText("No encontramos esta monitoría.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a Mis monitorías" })).toHaveAttribute(
      "href",
      "/mis-monitorias",
    );
  });
});
