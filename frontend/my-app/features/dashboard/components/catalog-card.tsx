"use client";

import { useEffect, useState } from "react";

import { ButtonLink } from "@/components/ui/button";
import { CATALOG_ADMIN_PATH } from "@/lib/auth";
import { type CatalogSummary, getCatalogSummary } from "@/lib/catalog";

import styles from "./catalog-card.module.css";

type CardState = { status: "loading" } | { status: "ready"; summary: CatalogSummary } | { status: "error" };

const numberFormat = new Intl.NumberFormat("es-CO");

/**
 * The catalog's coverage in the current term, one line long, with the way in. Its figures
 * are a bonus: if they fail to load, the link is still there.
 */
export default function CatalogCard() {
  const [state, setState] = useState<CardState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    getCatalogSummary(null, controller.signal).then(
      (summary) => {
        if (!controller.signal.aborted) setState({ status: "ready", summary });
      },
      () => {
        if (!controller.signal.aborted) setState({ status: "error" });
      },
    );
    return () => controller.abort();
  }, []);

  const term = state.status === "ready" ? state.summary.term : null;

  return (
    <section className={styles.card} aria-labelledby="catalog-card-title">
      <h2 id="catalog-card-title" className={styles.title}>
        {term ? `Catálogo ${term}` : "Catálogo"}
      </h2>
      {state.status === "loading" && <span className={styles.skeleton} aria-hidden="true" />}
      {state.status === "error" && (
        <p className={styles.facts}>Asignaturas, cursos y monitores de cada período.</p>
      )}
      {state.status === "ready" && (
        <ul className={styles.facts}>
          <li>{`${numberFormat.format(state.summary.courses)} cursos`}</li>
          <li data-alert={state.summary.courses_without_teacher > 0 || undefined}>
            {`${numberFormat.format(state.summary.courses_without_teacher)} sin docente`}
          </li>
          <li data-alert={state.summary.courses_without_monitor > 0 || undefined}>
            {`${numberFormat.format(state.summary.courses_without_monitor)} sin monitor`}
          </li>
        </ul>
      )}
      <ButtonLink href={CATALOG_ADMIN_PATH} variant="ghost" size="sm" className={styles.link}>
        Abrir catálogo
      </ButtonLink>
    </section>
  );
}
