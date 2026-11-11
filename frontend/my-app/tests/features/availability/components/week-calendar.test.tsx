import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import WeekCalendar from "@/features/availability/components/week-calendar";
import type { Slot } from "@/lib/availability";

import { GROUP_SLOT, INDIVIDUAL_SLOT, RESERVED_SLOT } from "../fixtures";

// INDIVIDUAL_SLOT is Cálculo (subject 1) on Tuesday 20 October, 10:00–11:00 in Bogotá;
// GROUP_SLOT is Mecánica, another subject, on Wednesday 21 at 14:30.
const DAYS = [
  "2026-10-19",
  "2026-10-20",
  "2026-10-21",
  "2026-10-22",
  "2026-10-23",
  "2026-10-24",
  "2026-10-25",
];
const WITHDRAWN: Slot = {
  ...INDIVIDUAL_SLOT,
  id: 40,
  starts_at: "2026-10-23T15:00:00Z",
  ends_at: "2026-10-23T16:00:00Z",
  status: "CANCELLED",
};

function renderWeek(slots: Slot[] = [INDIVIDUAL_SLOT, GROUP_SLOT, RESERVED_SLOT]) {
  const onCreate = vi.fn();
  const onOpen = vi.fn();
  render(
    <WeekCalendar
      days={DAYS}
      slots={slots}
      subjectId={1}
      today="2026-10-20"
      nowMinutes={9 * 60}
      loading={false}
      onCreate={onCreate}
      onOpen={onOpen}
    />,
  );
  return { onCreate, onOpen };
}

describe("WeekCalendar", () => {
  it("publishes a slot on the free half hour that was clicked", () => {
    const { onCreate } = renderWeek();

    const thursday = screen.getByRole("group", { name: "jueves, 22 de octubre" });
    fireEvent.click(
      within(thursday).getByRole("button", {
        name: "Publicar franja el jueves, 22 de octubre a las 15:00",
      }),
    );

    expect(onCreate).toHaveBeenCalledWith("2026-10-22", "15:00");
  });

  it("keeps past hours from taking new slots", () => {
    renderWeek();

    expect(
      screen.getByRole("button", { name: "Publicar franja el lunes, 19 de octubre a las 15:00" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Publicar franja el martes, 20 de octubre a las 08:30" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Publicar franja el martes, 20 de octubre a las 09:30" }),
    ).toBeEnabled();
  });

  it("opens the assignment's own slots with their state", () => {
    const { onOpen } = renderWeek();

    const tuesday = screen.getByRole("group", { name: "martes, 20 de octubre" });
    fireEvent.click(within(tuesday).getByRole("button", { name: /^10:00–11:00, Disponible/ }));
    expect(onOpen).toHaveBeenCalledWith(INDIVIDUAL_SLOT, expect.any(HTMLElement));

    const thursday = screen.getByRole("group", { name: "jueves, 22 de octubre" });
    expect(within(thursday).getByRole("button", { name: /^10:00–11:00, Sin cupos/ })).toBeVisible();
  });

  it("shows other subjects as busy time that does not open", () => {
    renderWeek();

    const wednesday = screen.getByRole("group", { name: "miércoles, 21 de octubre" });
    expect(within(wednesday).getByTitle("FIS-201 · Mecánica, 14:30–15:30")).toBeInTheDocument();
    expect(
      within(wednesday).queryByRole("button", { name: /14:30–15:30/ }),
    ).not.toBeInTheDocument();
  });

  it("leaves withdrawn slots off the grid", () => {
    renderWeek([WITHDRAWN]);

    const friday = screen.getByRole("group", { name: "viernes, 23 de octubre" });
    expect(within(friday).queryByRole("button", { name: /Retirada/ })).not.toBeInTheDocument();
  });

  it("shows one day at a time on phones, starting today", () => {
    const { onCreate } = renderWeek();

    expect(screen.getByRole("heading", { name: "martes, 20 de octubre" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "jueves, 22 de octubre, 1 franja" }));
    expect(screen.getByRole("heading", { name: "jueves, 22 de octubre" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Publicar franja este día" }));
    expect(onCreate).toHaveBeenCalledWith("2026-10-22", "");
  });
});
