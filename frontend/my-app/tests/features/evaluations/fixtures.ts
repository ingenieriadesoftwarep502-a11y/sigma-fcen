import type { Evaluation, EvaluationSummary, MonitorRating } from "@/lib/evaluations";

import { startedSlot } from "../sessions/fixtures";

export function evaluation(overrides: Partial<Evaluation> = {}): Evaluation {
  return {
    id: "e-1",
    session_id: "t-1",
    slot: startedSlot(26),
    rating: 5,
    comment: "Muy clara.",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

export function summary(overrides: Partial<EvaluationSummary> = {}): EvaluationSummary {
  return {
    id: "e-1",
    rating: 4,
    comment: "Muy clara.",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

export function rating(overrides: Partial<MonitorRating> = {}): MonitorRating {
  return {
    monitor: { id: "m-1", full_name: "Sofía Díaz" },
    published: true,
    average: 4.5,
    evaluation_count: 12,
    minimum_evaluations: 2,
    ...overrides,
  };
}

export const NOT_ENOUGH_DATA = rating({ published: false, average: null, evaluation_count: null });
