import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import MonitorRating, { RatingSummary } from "@/features/evaluations/components/monitor-rating";
import { ApiError } from "@/lib/api-client";
import { getMonitorRating } from "@/lib/evaluations";

import { NOT_ENOUGH_DATA, rating } from "./fixtures";

vi.mock("@/lib/evaluations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/evaluations")>()),
  getMonitorRating: vi.fn(),
}));

describe("RatingSummary (T-06.12)", () => {
  it("shows the published average and how many evaluations it covers", () => {
    render(<RatingSummary rating={rating()} />);

    expect(screen.getByText("4,5 de 5")).toBeInTheDocument();
    expect(screen.getByText("12 evaluaciones")).toBeInTheDocument();
  });

  it("says there is not enough data below the minimum (RN-007.5)", () => {
    render(<RatingSummary rating={NOT_ENOUGH_DATA} />);

    expect(screen.getByText("Sin datos suficientes")).toBeInTheDocument();
    expect(screen.getByText(/a partir de 2 evaluaciones/)).toBeInTheDocument();
    expect(screen.queryByText(/de 5/)).not.toBeInTheDocument();
  });
});

describe("MonitorRating (T-06.12)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads the monitor's rating", async () => {
    vi.mocked(getMonitorRating).mockResolvedValue(rating({ average: 3.67, evaluation_count: 3 }));

    render(<MonitorRating monitorId="m-1" />);

    expect(await screen.findByText("3,67 de 5")).toBeInTheDocument();
    expect(getMonitorRating).toHaveBeenCalledWith("m-1", expect.any(AbortSignal));
  });

  it("stays quiet when the rating cannot be read", async () => {
    vi.mocked(getMonitorRating).mockRejectedValue(new ApiError(500, "Error"));

    render(<MonitorRating monitorId="m-1" />);

    expect(await screen.findByText("Valoración no disponible por ahora.")).toBeInTheDocument();
  });
});
