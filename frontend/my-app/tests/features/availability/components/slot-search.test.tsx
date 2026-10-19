import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SlotSearch from "@/features/availability/components/slot-search";
import { NO_SLOT_SEARCH_FILTERS, searchSlots } from "@/lib/availability";

import { CALCULO_REF, GROUP_SLOT, INDIVIDUAL_SLOT, pageOf } from "../fixtures";

vi.mock("@/lib/availability", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/availability")>()),
  searchSlots: vi.fn(),
}));

const searchMock = vi.mocked(searchSlots);

/** The search as a subject's view opens it: that subject, in the current term. */
const SUBJECT_FILTERS = { ...NO_SLOT_SEARCH_FILTERS, term: "2026-2", subject: CALCULO_REF };

async function renderSearch() {
  render(<SlotSearch subject={CALCULO_REF} term="2026-2" />);
  return screen.findByRole("list", { name: "Franjas disponibles" });
}

function lastFilters() {
  return searchMock.mock.lastCall?.[1];
}

describe("SlotSearch (T-03.17, HU-02)", () => {
  beforeEach(() => {
    searchMock.mockResolvedValue(pageOf([INDIVIDUAL_SLOT, GROUP_SLOT]));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lists bookable slots with their session type and capacity", async () => {
    const list = await renderSearch();
    const items = within(list).getAllByRole("listitem");

    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(/martes, 20 de octubre/i);
    expect(items[0]).toHaveTextContent("10:00–11:00");
    expect(items[0]).toHaveTextContent("Cálculo diferencial");
    expect(items[0]).toHaveTextContent("Ana Pérez");
    expect(items[0]).toHaveTextContent("Presencial");
    expect(items[0]).toHaveTextContent("Bloque 14-203");
    expect(items[0]).toHaveTextContent("Individual · 1 cupo");
    expect(items[1]).toHaveTextContent("Grupal · 6 cupos");
    expect(items[1]).toHaveTextContent("Virtual");
    // Each detail is named by its term, not by its value.
    const terms = (item: HTMLElement) =>
      within(item).getAllByRole("term").map((term) => term.textContent);
    expect(terms(items[0]!)).toEqual(["Monitor", "Modalidad", "Aula o lugar"]);
    expect(terms(items[1]!)).toEqual(["Monitor", "Modalidad", "Enlace de la sesión"]);
    expect(screen.getByText("2 franjas disponibles")).toBeInTheDocument();
    expect(searchMock).toHaveBeenCalledWith(1, SUBJECT_FILTERS, expect.any(AbortSignal));
    // Reservations come in FASE-04: nothing here books a slot yet.
    expect(screen.queryByRole("button", { name: /Reservar/ })).not.toBeInTheDocument();
  });

  it("combines modality and date filters within the subject and term", async () => {
    await renderSearch();

    fireEvent.change(screen.getByLabelText("Modalidad"), { target: { value: "VIRTUAL" } });
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-10-19" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-10-25" } });

    await waitFor(() =>
      expect(lastFilters()).toEqual({
        term: "2026-2",
        subject: CALCULO_REF,
        monitor: null,
        modality: "VIRTUAL",
        dateFrom: "2026-10-19",
        dateTo: "2026-10-25",
      }),
    );
    expect(searchMock.mock.lastCall?.[0]).toBe(1);
  });

  it("narrows the results to one monitor from a result, and back", async () => {
    const list = await renderSearch();

    fireEvent.click(
      within(within(list).getAllByRole("listitem")[0]!).getByRole("button", {
        name: "Ver solo las franjas de Ana Pérez",
      }),
    );
    await waitFor(() => expect(lastFilters()?.monitor).toEqual({ id: "m-1", name: "Ana Pérez" }));
    expect(screen.getByText("Monitor: Ana Pérez")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Quitar el filtro de monitor" }));
    await waitFor(() => expect(lastFilters()?.monitor).toBeNull());
  });

  it("does not search a date range that ends before it starts", async () => {
    await renderSearch();
    const calls = searchMock.mock.calls.length;

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-10-25" } });
    await waitFor(() => expect(searchMock.mock.calls.length).toBe(calls + 1));
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-10-19" } });

    expect(
      await screen.findByText("La fecha final no puede ser anterior a la inicial."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Hasta")).toHaveAttribute("aria-invalid", "true");
    expect(searchMock.mock.calls.length).toBe(calls + 1);
    expect(lastFilters()?.dateTo).toBeNull();
  });

  it("pages through the results", async () => {
    searchMock.mockResolvedValue({
      count: 45,
      next: "http://api.test/api/v1/availability-slots/search/?page=2",
      previous: null,
      results: [INDIVIDUAL_SLOT],
    });
    await renderSearch();

    expect(screen.getByText("Página 1 de 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    await waitFor(() =>
      expect(searchMock).toHaveBeenLastCalledWith(2, SUBJECT_FILTERS, expect.any(AbortSignal)),
    );
  });

  it("says when no slot matches the filters and offers to clear them", async () => {
    await renderSearch();
    searchMock.mockResolvedValue(pageOf([]));

    fireEvent.change(screen.getByLabelText("Modalidad"), { target: { value: "VIRTUAL" } });

    expect(await screen.findByText("Ninguna franja coincide con los filtros.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    // The subject and term are the view's own, not filters to clear.
    await waitFor(() => expect(lastFilters()).toEqual(SUBJECT_FILTERS));
  });

  it("says when there are no bookable slots at all", async () => {
    searchMock.mockResolvedValue(pageOf([]));
    render(<SlotSearch subject={CALCULO_REF} term="2026-2" />);

    expect(
      await screen.findByText("Esta asignatura aún no tiene franjas disponibles."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Limpiar filtros" })).not.toBeInTheDocument();
  });
});
