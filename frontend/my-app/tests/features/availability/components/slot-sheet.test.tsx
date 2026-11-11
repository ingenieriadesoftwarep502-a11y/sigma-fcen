import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import SlotSheet from "@/features/availability/components/slot-sheet";
import { ApiError } from "@/lib/api-client";
import { cancelSlot, updateSlot } from "@/lib/availability";

import { CALCULO_ASSIGNMENT, INDIVIDUAL_SLOT, RESERVED_SLOT } from "../fixtures";

vi.mock("@/lib/availability", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/availability")>()),
  cancelSlot: vi.fn(),
  updateSlot: vi.fn(),
}));

function renderSheet(slot = INDIVIDUAL_SLOT) {
  const onChanged = vi.fn();
  const onBusyChange = vi.fn();
  render(
    <SlotSheet
      slot={slot}
      assignment={CALCULO_ASSIGNMENT}
      onChanged={onChanged}
      onBusyChange={onBusyChange}
    />,
  );
  return { onChanged, onBusyChange };
}

describe("SlotSheet (T-03.16)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows when, where and how many seats", () => {
    renderSheet();

    expect(screen.getByText("Disponible")).toBeInTheDocument();
    expect(screen.getByText("10:00–11:00")).toBeInTheDocument();
    expect(screen.getByText("martes, 20 de octubre")).toBeInTheDocument();
    expect(screen.getByText("Bloque 14-203")).toBeInTheDocument();
    expect(screen.getByText("Individual · 1 cupo")).toBeInTheDocument();
  });

  it("withdraws the slot only after a confirmation", async () => {
    vi.mocked(cancelSlot).mockResolvedValue(undefined);
    const { onChanged } = renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "Retirar" }));
    expect(cancelSlot).not.toHaveBeenCalled();
    const confirm = screen.getByRole("button", { name: "Confirmar retiro" });
    expect(confirm).toHaveFocus();
    fireEvent.click(confirm);

    await vi.waitFor(() =>
      expect(onChanged).toHaveBeenCalledWith(
        "Se retiró la franja el martes, 20 de octubre, 10:00–11:00.",
      ),
    );
    expect(cancelSlot).toHaveBeenCalledWith(21);
  });

  it("keeps the slot and says why when withdrawing fails", async () => {
    vi.mocked(cancelSlot).mockRejectedValue(
      new ApiError(409, "Conflict", { detail: "La franja ya no está disponible." }),
    );
    const { onChanged } = renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "Retirar" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar retiro" }));

    expect(await screen.findByText("La franja ya no está disponible.")).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("edits the slot in place, starting from its values", async () => {
    vi.mocked(updateSlot).mockResolvedValue(INDIVIDUAL_SLOT);
    const { onChanged } = renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "Editar franja" }));
    expect(screen.getByLabelText("Fecha")).toHaveValue("2026-10-20");
    expect(screen.getByLabelText("Hora de inicio")).toHaveValue("10:00");
    fireEvent.change(screen.getByLabelText("Hora de inicio"), { target: { value: "11:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await vi.waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(updateSlot).toHaveBeenCalledWith(
      21,
      expect.objectContaining({ starts_at: "2026-10-20T11:30:00-05:00" }),
    );
  });

  it("offers no changes once every seat is taken", () => {
    renderSheet(RESERVED_SLOT);

    expect(screen.getByText(/Todos sus cupos están reservados/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar franja" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retirar" })).not.toBeInTheDocument();
  });
});
