import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MonitorSlots from "@/features/availability/components/monitor-slots";
import { ApiError } from "@/lib/api-client";
import { NO_SLOT_SEARCH_FILTERS, type Slot, searchSlots } from "@/lib/availability";

import { CALCULO_REF, INDIVIDUAL_SLOT, pageOf } from "../fixtures";

vi.mock("@/lib/availability", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/availability")>()),
  searchSlots: vi.fn(),
}));

const searchMock = vi.mocked(searchSlots);

const MONITOR = { id: "m-1", name: "Ana Pérez" };
const FILTERS = {
  ...NO_SLOT_SEARCH_FILTERS,
  term: "2026-2",
  subject: CALCULO_REF,
  monitor: MONITOR,
};

/** Tuesday 20 October 2026, 14:00–15:30 in Bogotá: a group session, virtual. */
const LATER_SAME_DAY: Slot = {
  ...INDIVIDUAL_SLOT,
  id: 31,
  starts_at: "2026-10-20T19:00:00Z",
  ends_at: "2026-10-20T20:30:00Z",
  capacity: 5,
  modality: "VIRTUAL",
  location: "https://meet.example.org/calculo",
};

/** Thursday 22 October 2026, 08:00–09:00 in Bogotá. */
const THURSDAY: Slot = {
  ...INDIVIDUAL_SLOT,
  id: 32,
  starts_at: "2026-10-22T13:00:00Z",
  ends_at: "2026-10-22T14:00:00Z",
};

function renderSlots() {
  render(<MonitorSlots subject={CALCULO_REF} monitor={MONITOR} term="2026-2" />);
}

describe("MonitorSlots (HU-02)", () => {
  beforeEach(() => {
    searchMock.mockResolvedValue(pageOf([INDIVIDUAL_SLOT, LATER_SAME_DAY, THURSDAY]));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("asks only for this monitor's slots of the subject and term", async () => {
    renderSlots();

    expect(await screen.findByText("3 franjas disponibles")).toBeInTheDocument();
    expect(searchMock).toHaveBeenCalledWith(
      1,
      { ...FILTERS, modality: null },
      expect.any(AbortSignal),
    );
  });

  it("groups the slots by Bogotá day, with hours, length, place and seats", async () => {
    renderSlots();

    const tuesday = await screen.findByRole("region", {
      name: /martes, 20 de octubre/,
    });
    const rows = within(tuesday).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("10:00–11:00");
    expect(rows[0]).toHaveTextContent("1 h");
    expect(rows[0]).toHaveTextContent("Bloque 14-203");
    expect(rows[0]).toHaveTextContent("Individual · 1 cupo");
    expect(rows[1]).toHaveTextContent("14:00–15:30");
    expect(rows[1]).toHaveTextContent("1 h 30 min");
    expect(rows[1]).toHaveTextContent("Grupal · 5 cupos");

    const thursday = screen.getByRole("region", {
      name: /jueves, 22 de octubre/,
    });
    expect(within(thursday).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Reservar/ })).not.toBeInTheDocument();
  });

  it("filters by modality and offers the way back when nothing matches", async () => {
    renderSlots();
    await screen.findByText("3 franjas disponibles");
    searchMock.mockResolvedValue(pageOf([]));

    fireEvent.click(screen.getByRole("button", { name: "Virtual" }));

    expect(await screen.findByText("Ana no tiene franjas virtuales.")).toBeInTheDocument();
    expect(searchMock).toHaveBeenLastCalledWith(
      1,
      { ...FILTERS, modality: "VIRTUAL" },
      expect.any(AbortSignal),
    );
    expect(screen.getByRole("button", { name: "Virtual" })).toHaveAttribute("aria-pressed", "true");

    searchMock.mockResolvedValue(pageOf([INDIVIDUAL_SLOT]));
    fireEvent.click(screen.getByRole("button", { name: "Ver todas" }));
    expect(await screen.findByText("1 franja disponible")).toBeInTheDocument();
  });

  it("says when the monitor has nothing published yet", async () => {
    searchMock.mockResolvedValue(pageOf([]));
    renderSlots();

    expect(
      await screen.findByText("Ana no tiene franjas disponibles por ahora."),
    ).toBeInTheDocument();
  });

  it("reads further pages on demand and keeps the ones already shown", async () => {
    searchMock.mockResolvedValueOnce({
      count: 2,
      next: "page-2",
      previous: null,
      results: [INDIVIDUAL_SLOT],
    });
    searchMock.mockResolvedValueOnce({
      count: 2,
      next: null,
      previous: "page-1",
      results: [THURSDAY],
    });
    renderSlots();

    fireEvent.click(await screen.findByRole("button", { name: "Ver más franjas" }));

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
    expect(searchMock).toHaveBeenLastCalledWith(
      2,
      { ...FILTERS, modality: null },
      expect.any(AbortSignal),
    );
    expect(screen.queryByRole("button", { name: "Ver más franjas" })).not.toBeInTheDocument();
  });

  it("reports a failure and tries again", async () => {
    searchMock.mockRejectedValueOnce(new ApiError(0, "down", { detail: "Sin conexión." }));
    renderSlots();

    expect(await screen.findByText("Sin conexión.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Intentar de nuevo" }));

    expect(await screen.findByText("3 franjas disponibles")).toBeInTheDocument();
  });
});
