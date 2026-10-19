import Icon from "@/components/ui/icon";
import { isGroupSession, type Slot } from "@/lib/availability";

import { locationLabel, MODALITY_LABELS, sessionLabel, slotDayLabel, slotTimeRange } from "../labels";
import styles from "./slot-search.module.css";

type SlotResultCardProps = {
  slot: Slot;
  /** Narrows the search to this slot's monitor; absent when that filter is already on. */
  onPickMonitor?: () => void;
};

/**
 * One bookable slot as a student sees it: when (Bogotá time), what, who, where, and
 * whether the session is individual or a group one with its seats. Presentational.
 */
export default function SlotResultCard({ slot, onPickMonitor }: SlotResultCardProps) {
  const titleId = `slot-${slot.id}-title`;
  const monitorName = slot.monitor.full_name || "Monitor sin nombre";

  return (
    <article className={styles.card} aria-labelledby={titleId}>
      <header className={styles.cardHeader}>
        <p className={styles.when}>
          <span className={styles.day}>{slotDayLabel(slot.starts_at)}</span>
          <span className={styles.time}>{slotTimeRange(slot.starts_at, slot.ends_at)}</span>
        </p>
        <h3 id={titleId} className={styles.subject}>
          {slot.subject.name}
        </h3>
        <p className={styles.code}>{slot.subject.code}</p>
      </header>

      <dl className={styles.details}>
        <div>
          <dt>Monitor</dt>
          <dd>
            {onPickMonitor ? (
              <button
                type="button"
                className={styles.monitor}
                aria-label={`Ver solo las franjas de ${monitorName}`}
                onClick={onPickMonitor}
              >
                {monitorName}
              </button>
            ) : (
              monitorName
            )}
          </dd>
        </div>
        <div>
          <dt>Modalidad</dt>
          <dd>{MODALITY_LABELS[slot.modality]}</dd>
        </div>
        <div>
          <dt>{locationLabel(slot.modality)}</dt>
          <dd className={styles.location} title={slot.location}>
            {slot.location}
          </dd>
        </div>
      </dl>

      <footer className={styles.cardFooter}>
        <span className={styles.session} data-group={isGroupSession(slot.capacity) || undefined}>
          <Icon name="users" size={16} />
          {sessionLabel(slot.capacity)}
        </span>
      </footer>
    </article>
  );
}
