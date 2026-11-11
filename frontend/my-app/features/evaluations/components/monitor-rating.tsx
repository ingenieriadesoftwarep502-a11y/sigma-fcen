"use client";

import { useEffect, useState } from "react";

import { getMonitorRating, type MonitorRating as Rating, ratingLabel } from "@/lib/evaluations";

import styles from "./evaluations.module.css";

type State =
  | { status: "loading" }
  | { status: "ready"; rating: Rating }
  | { status: "error" };

function countLabel(count: number): string {
  return `${count} ${count === 1 ? "evaluación" : "evaluaciones"}`;
}

/**
 * A monitor's rating (T-06.12, RF-063): the average on the 1-to-5 scale, or "Sin datos
 * suficientes" below the minimum (RN-007.5). Presentational.
 */
export function RatingSummary({ rating }: { rating: Rating }) {
  if (!rating.published || rating.average === null) {
    return (
      <p className={styles.rating} data-published="false">
        <span className={styles.ratingTitle}>Valoración</span>
        <span className={styles.ratingValue}>Sin datos suficientes</span>
        <span className={styles.hint}>
          {`El promedio se publica a partir de ${rating.minimum_evaluations} evaluaciones.`}
        </span>
      </p>
    );
  }
  return (
    <p className={styles.rating} data-published="true">
      <span className={styles.ratingTitle}>Valoración</span>
      <span className={styles.ratingValue}>{ratingLabel(rating.average)}</span>
      {rating.evaluation_count !== null && (
        <span className={styles.hint}>{countLabel(rating.evaluation_count)}</span>
      )}
    </p>
  );
}

/** Loads and shows the rating of one monitor. Container. */
export default function MonitorRating({ monitorId }: { monitorId: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    getMonitorRating(monitorId, controller.signal).then(
      (rating) => {
        if (!controller.signal.aborted) setState({ status: "ready", rating });
      },
      () => {
        if (!controller.signal.aborted) setState({ status: "error" });
      },
    );
    return () => controller.abort();
  }, [monitorId]);

  if (state.status === "loading") {
    return <p className={styles.hint}>Cargando la valoración…</p>;
  }
  if (state.status === "error") {
    return <p className={styles.hint}>Valoración no disponible por ahora.</p>;
  }
  return <RatingSummary rating={state.rating} />;
}
