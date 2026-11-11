/**
 * Evaluation endpoints (FASE-06, HU-07): a student rates, once, a session they attended
 * (COMPLETED), from 1 to 5 with an optional comment; anyone signed in reads a monitor's
 * average, published only from the 2nd evaluation (confirmed 2026-11-10).
 *
 * RF-062: evaluations are anonymous to the monitor. The rating is an aggregate and no
 * response names the author of an individual evaluation; the comment is not shown to the
 * monitor either.
 *
 * Errors follow SAD §6.3: 400 rating out of the scale or a missed session (NO_SHOW), 403 a
 * session the student did not attend, 409 already evaluated.
 */

import { apiRequest, queryString } from "@/lib/api-client";
import type { HistoryItem } from "@/lib/sessions";
import type { components } from "@/types/api";

type Schemas = components["schemas"];

export type Evaluation = Schemas["Evaluation"];
export type EvaluationCreate = Schemas["EvaluationCreate"];
export type EvaluationSummary = Schemas["EvaluationSummary"];
export type EvaluationPage = Schemas["PaginatedEvaluationList"];
export type MonitorRating = Schemas["MonitorRating"];

/** Mirrors of backend/apps/evaluations/domain/rules.py, for form hints only. */
export const RATING_MIN = 1;
export const RATING_MAX = 5;
export const RATINGS: readonly number[] = [1, 2, 3, 4, 5];
export const MAX_COMMENT_LENGTH = 500;

const DECIMAL = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

/** A blank comment is left out; the API stores it as empty. */
export function submitEvaluation(data: EvaluationCreate): Promise<Evaluation> {
  const comment = data.comment?.trim();
  return apiRequest<Evaluation>("/evaluations/", {
    method: "POST",
    body: {
      session_id: data.session_id,
      rating: data.rating,
      ...(comment ? { comment } : {}),
    },
  });
}

/** The signed-in student's own evaluations, latest first. */
export function listMyEvaluations(page: number, signal?: AbortSignal): Promise<EvaluationPage> {
  return apiRequest<EvaluationPage>(`/evaluations/mine/${queryString({ page })}`, { signal });
}

/** T-06.10: how many attended sessions the signed-in student has not evaluated yet. */
export async function countPendingEvaluations(signal?: AbortSignal): Promise<number> {
  const page = await apiRequest<{ count: number }>(
    `/tutoring-sessions/pending-evaluation/${queryString({ page: 1, page_size: 1 })}`,
    { signal },
  );
  return page.count;
}

export function getMonitorRating(monitorId: string, signal?: AbortSignal): Promise<MonitorRating> {
  return apiRequest<MonitorRating>(`/monitors/${monitorId}/rating/`, { signal });
}

/** RN-007.1, RN-007.3: an attended session (COMPLETED) that the student has not rated. */
export function canEvaluate(item: HistoryItem): boolean {
  return item.status === "COMPLETED" && item.session !== null && item.evaluation === null;
}

/** e.g. "4 de 5", "3,67 de 5". */
export function ratingLabel(value: number): string {
  return `${DECIMAL.format(value)} de ${RATING_MAX}`;
}
