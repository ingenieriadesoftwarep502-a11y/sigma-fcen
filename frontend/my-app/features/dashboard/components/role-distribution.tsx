import { ROLE_CODES, ROLE_LABELS } from "@/lib/auth";
import type { UserSummary } from "@/lib/users";

import styles from "./role-distribution.module.css";

const numberFormat = new Intl.NumberFormat("es-CO");
const percentFormat = new Intl.NumberFormat("es-CO", { style: "percent", maximumFractionDigits: 0 });

type RoleDistributionProps = {
  counts: UserSummary["by_role"];
};

/**
 * How role assignments spread across the four roles: a segmented bar for the shape and a
 * legend that carries the exact numbers (the bar itself is hidden from screen readers).
 * An account can hold several roles, so shares are of assignments, not of accounts.
 */
export default function RoleDistribution({ counts }: RoleDistributionProps) {
  const assignments = ROLE_CODES.reduce((sum, role) => sum + counts[role], 0);
  const share = (count: number) => (assignments === 0 ? 0 : count / assignments);

  return (
    <section className={styles.panel} aria-labelledby="role-distribution-title">
      <h2 id="role-distribution-title" className={styles.title}>
        Distribución por rol
      </h2>

      <div className={styles.bar} aria-hidden="true" data-empty={assignments === 0 || undefined}>
        {ROLE_CODES.filter((role) => counts[role] > 0).map((role) => (
          <span
            key={role}
            className={styles.segment}
            data-role={role}
            style={{ flexGrow: counts[role] }}
            title={`${ROLE_LABELS[role]}: ${numberFormat.format(counts[role])}`}
          />
        ))}
      </div>

      <ul className={styles.legend}>
        {ROLE_CODES.map((role) => (
          <li key={role} className={styles.item}>
            <span className={styles.swatch} data-role={role} aria-hidden="true" />
            <span className={styles.label}>{ROLE_LABELS[role]}</span>
            <span className={styles.count}>{numberFormat.format(counts[role])}</span>
            <span className={styles.share}>{percentFormat.format(share(counts[role]))}</span>
          </li>
        ))}
      </ul>

      <p className={styles.note}>
        Una cuenta puede tener varios roles; los porcentajes se calculan sobre el total de
        asignaciones.
      </p>
    </section>
  );
}
