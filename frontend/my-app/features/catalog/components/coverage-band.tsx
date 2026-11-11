import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import type { CatalogSummary } from "@/lib/catalog";

import { countLabel, formatCount } from "../labels";
import styles from "./coverage-band.module.css";

export type CoverageGap = "withoutTeacher" | "withoutMonitors";

type CoverageBandProps = {
  summary: CatalogSummary | null;
  error: string | null;
  onRetry: () => void;
  /** A gap figure was chosen: list the courses behind it. */
  onShowGap: (gap: CoverageGap) => void;
};

/**
 * How well the current term is covered: courses, the ones missing a teacher or monitors
 * (each opens that list), and the monitoring committed. Presentational.
 */
export default function CoverageBand({ summary, error, onRetry, onShowGap }: CoverageBandProps) {
  if (!summary) {
    return error ? (
      <div className={styles.failure}>
        <Alert tone="error">{error}</Alert>
        <Button variant="ghost" size="sm" onClick={onRetry}>
          <Icon name="refresh" />
          Intentar de nuevo
        </Button>
      </div>
    ) : (
      <>
        <p role="status" className="sr-only">
          Cargando cobertura…
        </p>
        <div className={styles.skeleton} aria-hidden="true" />
      </>
    );
  }

  const title = summary.term ? `Cobertura del período ${summary.term}` : "Cobertura del catálogo";
  const gaps: { gap: CoverageGap; label: string; value: number }[] = [
    { gap: "withoutTeacher", label: "Sin docente", value: summary.courses_without_teacher },
    { gap: "withoutMonitors", label: "Sin monitor", value: summary.courses_without_monitor },
  ];

  return (
    <section className={styles.band} aria-labelledby="coverage-title">
      <h2 id="coverage-title" className={styles.title}>
        {title}
      </h2>
      {!summary.term && (
        <p className={styles.note}>
          Aún no hay períodos: crea uno en «Departamentos y períodos» para abrir cursos.
        </p>
      )}
      <ul className={styles.figures}>
        <li className={styles.figure}>
          <span className={styles.label}>Cursos</span>
          <span className={styles.value}>{formatCount(summary.courses)}</span>
          <span className={styles.detail}>
            {countLabel(summary.subjects_active, "asignatura activa", "asignaturas activas")}
          </span>
        </li>
        {gaps.map(({ gap, label, value }) => (
          <li key={gap} className={styles.figure}>
            <button
              type="button"
              className={styles.gap}
              data-alert={value > 0 || undefined}
              disabled={!summary.term}
              onClick={() => onShowGap(gap)}
            >
              <span className={styles.label}>{label}</span>
              <span className={styles.value}>{formatCount(value)}</span>
              <span className={styles.detail}>
                Ver cursos
                <Icon name="chevron" size={14} className={styles.arrow} />
              </span>
            </button>
          </li>
        ))}
        <li className={styles.figure}>
          <span className={styles.label}>Asignaciones de monitores</span>
          <span className={styles.value}>{formatCount(summary.monitor_assignments)}</span>
          <span className={styles.detail}>Monitores autorizados</span>
        </li>
        <li className={styles.figure}>
          <span className={styles.label}>Horas comprometidas</span>
          <span className={styles.value}>{formatCount(summary.committed_hours_total)}</span>
          <span className={styles.detail}>Suma de las asignaciones</span>
        </li>
      </ul>
    </section>
  );
}
