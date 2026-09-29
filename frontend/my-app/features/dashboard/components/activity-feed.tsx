import Avatar from "@/components/ui/avatar";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { initialsOf } from "@/lib/people";
import type { AuditEntry } from "@/lib/users";

import { activityParts } from "../activity";
import styles from "./activity-feed.module.css";

type ActivityFeedProps = {
  entries: readonly AuditEntry[];
};

function actorInitials(actor: AuditEntry["actor"]): string {
  if (!actor) return "S";
  return initialsOf({ first_name: actor.full_name, last_name: "", email: actor.email });
}

/** The latest account changes, newest first, told as sentences. Presentational. */
export default function ActivityFeed({ entries }: ActivityFeedProps) {
  const now = new Date();

  return (
    <section className={styles.panel} aria-labelledby="activity-feed-title">
      <h2 id="activity-feed-title" className={styles.title}>
        Actividad reciente
      </h2>

      {entries.length === 0 ? (
        <p className={styles.empty}>
          Aún no hay actividad registrada. Cuando se creen, editen o desactiven cuentas, los
          cambios aparecerán aquí.
        </p>
      ) : (
        <ol className={styles.list}>
          {entries.map((entry) => (
            <li key={entry.id} className={styles.item}>
              <Avatar initials={actorInitials(entry.actor)} size="sm" />
              <p className={styles.sentence}>
                {activityParts(entry).map((part, index) =>
                  part.person ? (
                    <strong key={index} className={styles.person}>
                      {part.text}
                    </strong>
                  ) : (
                    <span key={index}>{part.text}</span>
                  ),
                )}
              </p>
              <time
                className={styles.time}
                dateTime={entry.created_at}
                title={formatDateTime(entry.created_at)}
              >
                {formatRelativeTime(entry.created_at, now)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
