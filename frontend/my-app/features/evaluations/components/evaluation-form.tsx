"use client";

import { type FormEvent, useId, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import { ApiError, formErrors } from "@/lib/api-client";
import {
  type Evaluation,
  MAX_COMMENT_LENGTH,
  RATING_MAX,
  RATING_MIN,
  RATINGS,
  ratingLabel,
  submitEvaluation,
} from "@/lib/evaluations";

import styles from "./evaluations.module.css";

const FIELDS = ["session_id", "rating", "comment"] as const;
type Field = (typeof FIELDS)[number];
type Errors = Partial<Record<Field, string[]>>;

const RATING_REQUIRED_MESSAGE = `Elige una calificación de ${RATING_MIN} a ${RATING_MAX}.`;

type EvaluationFormProps = {
  sessionId: string;
  onSaved: (evaluation: Evaluation) => void;
  /** 409: the session was already evaluated, e.g. from another tab (CA-HU07-2). */
  onAlreadyEvaluated: () => void;
  onCancel?: () => void;
};

/**
 * Rates a session the student attended, once (T-06.11, HU-07): a 1-to-5 scale and an
 * optional comment. The monitor never sees who rated them (RF-062).
 */
export default function EvaluationForm({
  sessionId,
  onSaved,
  onAlreadyEvaluated,
  onCancel,
}: EvaluationFormProps) {
  const id = useId();
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);
    if (rating === null) {
      setErrors({ rating: [RATING_REQUIRED_MESSAGE] });
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      onSaved(await submitEvaluation({ session_id: sessionId, rating, comment }));
    } catch (error) {
      setSubmitting(false);
      if (error instanceof ApiError && error.status === 409) {
        onAlreadyEvaluated();
        return;
      }
      const { byField, message } = formErrors(error, FIELDS);
      setErrors(byField);
      setFormError(message ?? byField.session_id?.join(" ") ?? null);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className={styles.form}>
      {formError && <Alert tone="error">{formError}</Alert>}

      <div
        role="radiogroup"
        aria-labelledby={`${id}-rating`}
        aria-describedby={errors.rating ? `${id}-rating-errors` : undefined}
        className={styles.scale}
      >
        <span id={`${id}-rating`} className={styles.legend}>
          Calificación
        </span>
        <span className={styles.choices}>
          {RATINGS.map((value) => (
            <label key={value} className={styles.choice} data-checked={rating === value || undefined}>
              <input
                type="radio"
                name={`${id}-rating`}
                value={value}
                checked={rating === value}
                aria-label={ratingLabel(value)}
                className={styles.radio}
                onChange={() => setRating(value)}
              />
              <span aria-hidden="true">{value}</span>
            </label>
          ))}
        </span>
        <span className={styles.hint} aria-hidden="true">
          1 es muy insatisfecho y 5, muy satisfecho.
        </span>
        <FieldErrors id={`${id}-rating-errors`} messages={errors.rating} />
      </div>

      <div className={styles.textArea}>
        <label htmlFor={`${id}-comment`} className={styles.legend}>
          Comentario (opcional)
        </label>
        <textarea
          id={`${id}-comment`}
          rows={3}
          maxLength={MAX_COMMENT_LENGTH}
          className={styles.comment}
          value={comment}
          aria-describedby={`${id}-comment-hint`}
          onChange={(event) => setComment(event.target.value)}
        />
        <p id={`${id}-comment-hint`} className={styles.hint}>
          Tu evaluación es anónima: tu monitor no ve quién lo calificó ni tu comentario.
        </p>
        <FieldErrors id={`${id}-comment-errors`} messages={errors.comment} />
      </div>

      <div className={styles.actions}>
        <Button type="submit" size="sm" softDisabled={submitting}>
          {submitting ? "Enviando…" : "Enviar evaluación"}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}

function FieldErrors({ id, messages }: { id: string; messages: string[] | undefined }) {
  if (!messages || messages.length === 0) return null;
  return (
    <ul id={id} className={styles.errors}>
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  );
}
