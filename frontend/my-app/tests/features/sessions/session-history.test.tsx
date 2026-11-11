import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SessionHistory from "@/features/sessions/components/session-history";
import { countPendingEvaluations, submitEvaluation } from "@/lib/evaluations";
import { listHistory } from "@/lib/sessions";

import { pageOf } from "../availability/fixtures";
import { evaluation, summary } from "../evaluations/fixtures";
import { historyItem } from "./fixtures";

vi.mock("@/lib/sessions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sessions")>()),
  listHistory: vi.fn(),
}));
vi.mock("@/lib/evaluations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/evaluations")>()),
  countPendingEvaluations: vi.fn(),
  submitEvaluation: vi.fn(),
}));

describe("SessionHistory (T-05.17, HU-12)", () => {
  beforeEach(() => {
    vi.mocked(listHistory).mockResolvedValue(pageOf([historyItem()]));
    vi.mocked(countPendingEvaluations).mockResolvedValue(0);
    vi.mocked(submitEvaluation).mockResolvedValue(evaluation({ rating: 4, comment: "" }));
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
    expect(within(item).getByRole("button", { name: /Evaluar/ })).toBeInTheDocument();
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

  it("shows the student's own evaluation once given", async () => {
    vi.mocked(listHistory).mockResolvedValue(
      pageOf([historyItem({ evaluation: summary({ rating: 4, comment: "Muy clara." }) })]),
    );
    render(<SessionHistory />);

    const item = await screen.findByRole("listitem");
    expect(item).toHaveTextContent("Tu evaluación: 4 de 5");
    expect(item).toHaveTextContent("Muy clara.");
    expect(within(item).queryByRole("button", { name: /Evaluar/ })).not.toBeInTheDocument();
  });

  it("does not offer to evaluate a missed session (CA-HU07-5)", async () => {
    vi.mocked(listHistory).mockResolvedValue(pageOf([historyItem({ status: "NO_SHOW" })]));
    render(<SessionHistory />);

    const item = await screen.findByRole("listitem");
    expect(within(item).queryByRole("button", { name: /Evaluar/ })).not.toBeInTheDocument();
    expect(item).not.toHaveTextContent("Sin evaluar");
  });

  it("evaluates an attended session in place (T-06.11)", async () => {
    render(<SessionHistory />);
    const item = await screen.findByRole("listitem");

    fireEvent.click(within(item).getByRole("button", { name: /Evaluar/ }));
    fireEvent.click(within(item).getByRole("radio", { name: "4 de 5" }));
    fireEvent.click(within(item).getByRole("button", { name: "Enviar evaluación" }));

    expect(await within(item).findByText("Tu evaluación: 4 de 5")).toBeInTheDocument();
    expect(submitEvaluation).toHaveBeenCalledWith({ session_id: "t-1", rating: 4, comment: "" });
    expect(screen.getByRole("status")).toHaveTextContent("Gracias por evaluar la monitoría.");
  });

  it("tells how many sessions are still to evaluate (T-06.10)", async () => {
    vi.mocked(countPendingEvaluations).mockResolvedValue(2);
    render(<SessionHistory />);

    expect(await screen.findByText("Tienes 2 monitorías por evaluar.")).toBeInTheDocument();
  });
});
