import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import EvaluationForm from "@/features/evaluations/components/evaluation-form";
import { ApiError } from "@/lib/api-client";
import { submitEvaluation } from "@/lib/evaluations";

import { evaluation } from "./fixtures";

vi.mock("@/lib/evaluations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/evaluations")>()),
  submitEvaluation: vi.fn(),
}));

describe("EvaluationForm (T-06.11)", () => {
  const onSaved = vi.fn();
  const onAlreadyEvaluated = vi.fn();

  beforeEach(() => {
    vi.mocked(submitEvaluation).mockResolvedValue(evaluation({ rating: 4 }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function renderForm() {
    render(
      <EvaluationForm sessionId="t-1" onSaved={onSaved} onAlreadyEvaluated={onAlreadyEvaluated} />,
    );
  }

  it("offers the 1 to 5 scale and sends the rating with the comment", async () => {
    renderForm();

    const scale = screen.getByRole("radiogroup", { name: "Calificación" });
    expect(scale).toBeInTheDocument();
    for (const value of [1, 2, 3, 4, 5]) {
      expect(screen.getByRole("radio", { name: `${value} de 5` })).not.toBeChecked();
    }
    fireEvent.click(screen.getByRole("radio", { name: "4 de 5" }));
    fireEvent.change(screen.getByLabelText("Comentario (opcional)"), {
      target: { value: "Muy clara." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar evaluación" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(submitEvaluation).toHaveBeenCalledWith({
      session_id: "t-1",
      rating: 4,
      comment: "Muy clara.",
    });
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ rating: 4, comment: "Muy clara." }),
    );
  });

  it("asks for a rating before sending", async () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Enviar evaluación" }));

    expect(await screen.findByText("Elige una calificación de 1 a 5.")).toBeInTheDocument();
    expect(submitEvaluation).not.toHaveBeenCalled();
  });

  it("says the comment is not shown to the monitor and caps its length", () => {
    renderForm();

    expect(screen.getByLabelText("Comentario (opcional)")).toHaveAttribute("maxLength", "500");
    expect(screen.getByText(/tu monitor no ve quién lo calificó/i)).toBeInTheDocument();
  });

  it("shows the API's rule message next to the rating", async () => {
    vi.mocked(submitEvaluation).mockRejectedValue(
      new ApiError(400, "Datos inválidos", {
        rating: ["La calificación debe ser un número entero entre 1 y 5."],
      }),
    );
    renderForm();

    fireEvent.click(screen.getByRole("radio", { name: "5 de 5" }));
    fireEvent.click(screen.getByRole("button", { name: "Enviar evaluación" }));

    expect(
      await screen.findByText("La calificación debe ser un número entero entre 1 y 5."),
    ).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("reports a session already evaluated (409, CA-HU07-2)", async () => {
    vi.mocked(submitEvaluation).mockRejectedValue(
      new ApiError(409, "Ya evaluaste esta sesión.", { detail: "Ya evaluaste esta sesión." }),
    );
    renderForm();

    fireEvent.click(screen.getByRole("radio", { name: "3 de 5" }));
    fireEvent.click(screen.getByRole("button", { name: "Enviar evaluación" }));

    await waitFor(() => expect(onAlreadyEvaluated).toHaveBeenCalled());
    expect(onSaved).not.toHaveBeenCalled();
  });
});
