import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SessionHistory from "@/features/sessions/components/session-history";
import { listHistory } from "@/lib/sessions";

import { pageOf } from "../availability/fixtures";
import { historyItem } from "./fixtures";

vi.mock("@/lib/sessions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sessions")>()),
  listHistory: vi.fn(),
}));

describe("SessionHistory (T-05.17, HU-12)", () => {
  beforeEach(() => {
    vi.mocked(listHistory).mockResolvedValue(pageOf([historyItem()]));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows subject, monitor, outcome, topics and the evaluation (CA-HU12-1)", async () => {
    render(<SessionHistory />);

    const list = await screen.findByRole("list", { name: "Tu historial de monitorías" });
    const item = within(list).getByRole("listitem");
    expect(item).toHaveTextContent("Cálculo diferencial");
    expect(item).toHaveTextContent("Con Sofía Díaz");
    expect(item).toHaveTextContent("Asististe");
    expect(item).toHaveTextContent("Regla de la cadena");
    expect(item).toHaveTextContent("Sin evaluar");
    expect(listHistory).toHaveBeenCalledWith(
      1,
      { status: null, subject: null },
      expect.any(AbortSignal),
    );
  });

  it("marks a late cancellation as an absence without a session", async () => {
    vi.mocked(listHistory).mockResolvedValue(
      pageOf([historyItem({ status: "NO_SHOW", session: null })]),
    );
    render(<SessionHistory />);

    const item = await screen.findByRole("listitem");
    expect(item).toHaveTextContent("Inasistencia");
    expect(item).not.toHaveTextContent("Regla de la cadena");
  });

  it("filters by outcome", async () => {
    render(<SessionHistory />);
    await screen.findByRole("listitem");

    fireEvent.click(screen.getByRole("button", { name: "Inasistencias" }));

    await waitFor(() =>
      expect(listHistory).toHaveBeenLastCalledWith(
        1,
        { status: "NO_SHOW", subject: null },
        expect.any(AbortSignal),
      ),
    );
  });

  it("shows an empty state for a student without history (CA-HU12-2)", async () => {
    vi.mocked(listHistory).mockResolvedValue(pageOf([]));
    render(<SessionHistory />);

    expect(await screen.findByText("Aún no tienes monitorías en tu historial.")).toBeInTheDocument();
  });
});
