import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MySessions from "@/features/sessions/components/my-sessions";
import { listMaterials } from "@/lib/materials";
import { listMySessions, listPendingSlots, listTopics } from "@/lib/sessions";

import { pageOf } from "../availability/fixtures";
import { CADENA, pendingSlot, session } from "./fixtures";

vi.mock("@/lib/sessions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sessions")>()),
  listPendingSlots: vi.fn(),
  listMySessions: vi.fn(),
  listTopics: vi.fn(),
}));
vi.mock("@/lib/materials", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/materials")>()),
  listMaterials: vi.fn(),
}));

const HOUR = 3_600_000;

describe("MySessions (T-05.16)", () => {
  beforeEach(() => {
    vi.mocked(listPendingSlots).mockResolvedValue([pendingSlot()]);
    vi.mocked(listMySessions).mockResolvedValue(pageOf([session()]));
    vi.mocked(listTopics).mockResolvedValue([CADENA]);
    vi.mocked(listMaterials).mockResolvedValue(pageOf([]));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lists the slots to record with who booked them", async () => {
    render(<MySessions />);

    const pending = await screen.findByRole("list", { name: "Monitorías por registrar" });
    const item = within(pending).getByRole("listitem");
    expect(item).toHaveTextContent("Cálculo diferencial");
    expect(item).toHaveTextContent("Ana Pérez, Luis Gómez");
  });

  it("opens the record form for a pending slot", async () => {
    render(<MySessions />);

    fireEvent.click(await screen.findByRole("button", { name: /Registrar sesión de Cálculo/ }));

    expect(await screen.findByRole("dialog", { name: "Registrar sesión" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Asistencia" })).toBeInTheDocument();
  });

  it("shows the recorded sessions with their topics and attendance", async () => {
    render(<MySessions />);

    const recorded = await screen.findByRole("list", { name: "Sesiones registradas" });
    const item = within(recorded).getByRole("listitem");
    expect(item).toHaveTextContent("Regla de la cadena");
    expect(item).toHaveTextContent("1 asistió · 1 no asistió");
    expect(within(item).getByRole("button", { name: /Editar sesión/ })).toBeInTheDocument();
  });

  it("says when a session can no longer be edited (RF-052)", async () => {
    const old = new Date(Date.now() - 50 * HOUR);
    vi.mocked(listMySessions).mockResolvedValue(
      pageOf([
        session({
          recorded_at: old.toISOString(),
          editable_until: new Date(old.getTime() + 48 * HOUR).toISOString(),
        }),
      ]),
    );
    render(<MySessions />);

    const recorded = await screen.findByRole("list", { name: "Sesiones registradas" });
    expect(within(recorded).queryByRole("button", { name: /Editar sesión/ })).not.toBeInTheDocument();
    expect(recorded).toHaveTextContent("Ya no se puede editar");
  });

  it("says so when nothing is pending", async () => {
    vi.mocked(listPendingSlots).mockResolvedValue([]);
    render(<MySessions />);

    expect(await screen.findByText("No tienes monitorías por registrar.")).toBeInTheDocument();
  });
});
