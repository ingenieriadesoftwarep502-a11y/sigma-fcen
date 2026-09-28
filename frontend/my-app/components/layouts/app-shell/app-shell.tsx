import type { ReactNode } from "react";

import styles from "./app-shell.module.css";

type AppShellProps = {
  /** Right side of the top bar, e.g. the signed-in account. */
  account: ReactNode;
  children: ReactNode;
};

/** Frame of every signed-in page: brand bar on top, content below. Presentational. */
export default function AppShell({ account, children }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <p className={styles.brand}>
          SIGMA<span className={styles.brandAccent}>·FCEN</span>
        </p>
        {account}
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
