import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MonitorSlots from "@/features/availability/components/monitor-slots";
import { ApiError } from "@/lib/api-client";
import { NO_SLOT_SEARCH_FILTERS, type Slot, searchSlots } from "@/lib/availability";
import { reserveSlot } from "@/lib/reservations";

import { CALCULO_REF, INDIVIDUAL_SLOT, pageOf } from "../fixtures";

vi.mock("@/lib/availability", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/availability")>()),
  searchSlots: vi.fn(),
}));

vi.mock("@/lib/reservations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/reservations")>()),
  reserveSlot: vi.fn(),
}));

const searchMock = vi.mocked(searchSlots);
const reserveMock = vi.mocked(reserveSlot);

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
  remaining_seats: 3,
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
    expect(rows[1]).toHaveTextContent("Grupal · 3 de 5 cupos libres");

    const thursday = screen.getByRole("region", {
      name: /jueves, 22 de octubre/,
    });
    expect(within(thursday).getAllByRole("listitem")).toHaveLength(1);
    expect(within(rows[0]!).getByRole("button", { name: "Reservar 10:00–11:00" })).toBeEnabled();
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

  describe("booking (FASE-04, T-04.19, RF-047)", () => {
    /** Opens the confirmation of the slot at `range`, optionally writes a note, confirms. */
    async function book(range: string, note?: string) {
      fireEvent.click(await screen.findByRole("button", { name: `Reservar ${range}` }));
      const confirm = screen.getByRole("group", { name: "Confirmar reserva" });
      if (note !== undefined) {
        fireEvent.change(within(confirm).getByLabelText("Nota para el monitor (opcional)"), {
          target: { value: note },
        });
      }
      fireEvent.click(within(confirm).getByRole("button", { name: "Confirmar reserva" }));
    }

    it("asks for confirmation before booking, and can step back", async () => {
      renderSlots();

      fireEvent.click(await screen.findByRole("button", { name: "Reservar 10:00–11:00" }));
      const confirm = screen.getByRole("group", { name: "Confirmar reserva" });
      expect(confirm).toHaveTextContent("0/500");
      fireEvent.click(within(confirm).getByRole("button", { name: "Volver" }));

      expect(screen.queryByRole("group", { name: "Confirmar reserva" })).not.toBeInTheDocument();
      expect(reserveMock).not.toHaveBeenCalled();
    });

    it("counts the characters of the optional note and sends it", async () => {
      reserveMock.mockResolvedValue({} as Awaited<ReturnType<typeof reserveSlot>>);
      renderSlots();

      fireEvent.click(await screen.findByRole("button", { name: "Reservar 10:00–11:00" }));
      const confirm = screen.getByRole("group", { name: "Confirmar reserva" });
      const field = within(confirm).getByLabelText("Nota para el monitor (opcional)");
      expect(field).toHaveAttribute("maxLength", "500");
      fireEvent.change(field, { target: { value: "Repasar derivadas" } });
      expect(confirm).toHaveTextContent("17/500");
      fireEvent.click(within(confirm).getByRole("button", { name: "Confirmar reserva" }));

      await waitFor(() =>
        expect(reserveMock).toHaveBeenCalledWith(INDIVIDUAL_SLOT.id, "Repasar derivadas"),
      );
    });

    it("reserves an individual slot, confirms it and takes it off the list", async () => {
      reserveMock.mockResolvedValue({} as Awaited<ReturnType<typeof reserveSlot>>);
      renderSlots();

      await book("10:00–11:00");

      expect(
        await screen.findByText(/Reservaste la monitoría del martes, 20 de octubre, 10:00–11:00/),
      ).toBeInTheDocument();
      expect(reserveMock).toHaveBeenCalledWith(INDIVIDUAL_SLOT.id, "");
      expect(screen.queryByRole("button", { name: "Reservar 10:00–11:00" })).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Ver mis reservas" })).toHaveAttribute(
        "href",
        "/mis-reservas",
      );
    });

    it("keeps a group slot listed with one seat less", async () => {
      reserveMock.mockResolvedValue({} as Awaited<ReturnType<typeof reserveSlot>>);
      renderSlots();

      await book("14:00–15:30");

      expect(await screen.findByText("Grupal · 2 de 5 cupos libres")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Reservar 14:00–15:30" })).toBeInTheDocument();
    });

    it("explains a 409 and reads the slots again: someone else took the last seat", async () => {
      reserveMock.mockRejectedValue(
        new ApiError(409, "taken", {
          type: "slot_unavailable",
          status: 409,
          detail: "La franja ya no está disponible.",
        }),
      );
      renderSlots();
      await screen.findByText("3 franjas disponibles");
      searchMock.mockResolvedValue(pageOf([LATER_SAME_DAY, THURSDAY]));

      await book("10:00–11:00");

      expect(
        await screen.findByText(
          "La franja ya no está disponible. Otra persona la reservó hace un momento; te mostramos las franjas actualizadas.",
        ),
      ).toBeInTheDocument();
      expect(await screen.findByText("2 franjas disponibles")).toBeInTheDocument();
      expect(searchMock).toHaveBeenCalledTimes(2);
    });

    it("shows a rule the API applied and keeps the note to try again", async () => {
      reserveMock.mockRejectedValue(
        new ApiError(400, "rule", {
          type: "validation_error",
          status: 400,
          detail: "En ese horario ya tienes una reserva confirmada.",
          errors: { slot_id: ["En ese horario ya tienes una reserva confirmada."] },
        }),
      );
      renderSlots();

      await book("10:00–11:00", "Mi nota");

      expect(
        await screen.findByText("En ese horario ya tienes una reserva confirmada."),
      ).toBeInTheDocument();
      const confirm = screen.getByRole("group", { name: "Confirmar reserva" });
      expect(within(confirm).getByLabelText("Nota para el monitor (opcional)")).toHaveValue("Mi nota");
      expect(within(confirm).getByRole("button", { name: "Confirmar reserva" })).toBeEnabled();
      expect(searchMock).toHaveBeenCalledTimes(1);
    });
  });
});
