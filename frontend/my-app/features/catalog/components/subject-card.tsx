import Icon from "@/components/ui/icon";
import type { Subject } from "@/lib/catalog";

import { creditsLabel, monitorsLabel } from "../labels";
import styles from "./subject-card.module.css";

type SubjectCardProps = {
  subject: Subject;
  pinned: boolean;
  onTogglePin: (subject: Subject) => void;
  /** Heading level of the subject name within the page outline. */
  headingLevel?: 2 | 3;
};

/**
 * One subject of the catalog: what it is, where it belongs, and whether it has monitors in
 * the term in view. Informational; FASE-03 adds its schedules. Presentational.
 */
export default function SubjectCard({
  subject,
  pinned,
  onTogglePin,
  headingLevel = 3,
}: SubjectCardProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const hasMonitors = subject.monitor_count > 0;

  return (
    <article className={styles.card}>
      <div className={styles.top}>
        <p className={styles.meta}>
          <span className={styles.code}>{subject.code}</span>
          <span aria-hidden="true">·</span>
          <span>{creditsLabel(subject.credits)}</span>
        </p>
        <button
          type="button"
          className={styles.pin}
          aria-pressed={pinned}
          aria-label={`Fijar ${subject.name} en Mis asignaturas`}
          title={pinned ? "Quitar de Mis asignaturas" : "Fijar en Mis asignaturas"}
          onClick={() => onTogglePin(subject)}
        >
          <Icon name="bookmark" size={18} fill={pinned ? "currentColor" : "none"} />
        </button>
      </div>
      <Heading className={styles.name}>{subject.name}</Heading>
      <p className={styles.department}>{subject.department.name}</p>
      <p className={styles.monitors} data-available={hasMonitors}>
        {monitorsLabel(subject.monitor_count)}
      </p>
    </article>
  );
}

/** A card-shaped placeholder while the first results load. */
export function SubjectCardSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      <span className={styles.skeletonLine} data-width="short" />
      <span className={styles.skeletonLine} data-width="long" />
      <span className={styles.skeletonLine} data-width="medium" />
      <span className={styles.skeletonLine} data-width="short" />
    </div>
  );
}
