import Button from "@/components/ui/button";

import styles from "./session-status.module.css";

type SessionStatusProps = {
  /** A failure to report; without it the session is still being checked. */
  message?: string;
  onRetry?: () => void;
};

/** Fills the page while the session is checked, or explains why it could not be. */
export default function SessionStatus({ message, onRetry }: SessionStatusProps) {
  if (message) {
    return (
      <div className={styles.status} role="alert">
        <p className={styles.message}>{message}</p>
        {onRetry && (
          <Button variant="ghost" onClick={onRetry}>
            Intentar de nuevo
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className={styles.status} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      <p className={styles.message}>Verificando tu sesión…</p>
    </div>
  );
}
