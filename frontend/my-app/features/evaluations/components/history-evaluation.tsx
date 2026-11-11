"use client";

import { useState } from "react";

import Button from "@/components/ui/button";
import { canEvaluate, type EvaluationSummary, ratingLabel } from "@/lib/evaluations";
import type { HistoryItem } from "@/lib/sessions";

import EvaluationForm from "./evaluation-form";
import styles from "./evaluations.module.css";

type HistoryEvaluationProps = {
  item: HistoryItem;
  /** e.g. "Evaluar la monitoría de Cálculo diferencial del lunes". */
  label: string;
  onEvaluated: (evaluation: EvaluationSummary) => void;
  onAlreadyEvaluated: () => void;
};

/**
 * The evaluation part of a history card (T-06.11): the student's own rating once given, or,
 * for an attended session not evaluated yet, the button that opens the form in place.
 * A missed session shows nothing: it cannot be evaluated (RN-007.3).
 */
export default function HistoryEvaluation({
  item,
  label,
  onEvaluated,
  onAlreadyEvaluated,
}: HistoryEvaluationProps) {
  const [open, setOpen] = useState(false);
  const given = item.evaluation;

  if (given) {
    return (
      <div className={styles.given}>
        <span className={styles.givenRating}>{`Tu evaluación: ${ratingLabel(given.rating)}`}</span>
        {given.comment && <span className={styles.givenComment}>{given.comment}</span>}
      </div>
    );
  }
  if (!canEvaluate(item) || !item.session) return null;
  if (open) {
    return (
      <EvaluationForm
        sessionId={item.session.id}
        onSaved={(evaluation) =>
          onEvaluated({
            id: evaluation.id,
            rating: evaluation.rating,
            comment: evaluation.comment,
            created_at: evaluation.created_at,
          })
        }
        onAlreadyEvaluated={onAlreadyEvaluated}
        onCancel={() => setOpen(false)}
      />
    );
  }
  return (
    <div className={styles.pendingRow}>
      <span>Sin evaluar</span>
      <Button size="sm" variant="ghost" aria-label={label} onClick={() => setOpen(true)}>
        Evaluar
      </Button>
    </div>
  );
}
