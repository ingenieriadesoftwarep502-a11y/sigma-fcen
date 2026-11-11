import type { UserSummary } from "@/lib/users";

import styles from "./summary-figures.module.css";

const numberFormat = new Intl.NumberFormat("es-CO");
const percentFormat = new Intl.NumberFormat("es-CO", { style: "percent", maximumFractionDigits: 0 });

function shareOf(part: number, total: number): string {
  return total === 0 ? "Sin cuentas aún" : `${percentFormat.format(part / total)} del total`;
}

type SummaryFiguresProps = {
  summary: Pick<UserSummary, "total" | "active" | "inactive" | "joined_last_30_days">;
};

/** The four headline counts as one band, each with a line of context. Presentational. */
export default function SummaryFigures({ summary }: SummaryFiguresProps) {
  const { total, active, inactive, joined_last_30_days: joined } = summary;
  const figures = [
    { label: "Usuarios totales", value: total, note: "Cuentas registradas" },
    { label: "Activos", value: active, note: shareOf(active, total) },
    { label: "Inactivos", value: inactive, note: "Sin acceso al sistema" },
    { label: "Nuevos en 30 días", value: joined, note: shareOf(joined, total) },
  ];

  return (
    <section className={styles.band} aria-labelledby="summary-figures-title">
      <h2 id="summary-figures-title" className="sr-only">
        Cifras de usuarios
      </h2>
      <dl className={styles.figures}>
        {figures.map((figure) => (
          <div key={figure.label} className={styles.figure}>
            <dt className={styles.label}>{figure.label}</dt>
            <dd className={styles.value}>{numberFormat.format(figure.value)}</dd>
            <dd className={styles.note}>{figure.note}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
