import type { ReactNode } from "react";

import styles from "./empty-state.module.css";

type EmptyStateProps = {
  title: string;
  /** What the person can do about it, in a sentence or two. */
  children?: ReactNode;
  /** A way out, such as clearing the filters. */
  action?: ReactNode;
};

/** Says why a list is empty and what to try next. Presentational. */
export default function EmptyState({ title, children, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <p className={styles.title}>{title}</p>
      {children && <div className={styles.body}>{children}</div>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
