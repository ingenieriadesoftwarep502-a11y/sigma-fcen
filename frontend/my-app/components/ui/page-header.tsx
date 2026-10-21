import type { ReactNode } from "react";

import styles from "./page-header.module.css";

type PageHeaderProps = {
  /** Also names the page's landmark through `titleId`. */
  title: string;
  titleId: string;
  lead: string;
  /** Page-level actions or controls, aligned to the end. */
  children?: ReactNode;
};

/** A signed-in page's display title and one line of purpose. Presentational. */
export default function PageHeader({ title, titleId, lead, children }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <div>
        <h1 id={titleId} className={styles.title}>
          {title}
        </h1>
        <p className={styles.lead}>{lead}</p>
      </div>
      {children && <div className={styles.actions}>{children}</div>}
    </header>
  );
}
