"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";

import styles from "./user-panel.module.css";

type UserPanelProps = {
  title: string;
  /** Shown under the title, e.g. the email of the account being edited. */
  subtitle?: string;
  /** While a change is being stored, the panel cannot be closed. */
  locked?: boolean;
  onClose: () => void;
  children: ReactNode;
};

/**
 * Side panel next to the users table; a full-width overlay on narrow screens.
 * Non-modal on wide screens, so the table stays usable. Escape closes it.
 */
export default function UserPanel({
  title,
  subtitle,
  locked = false,
  onClose,
  children,
}: UserPanelProps) {
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);

  // Keyboard and screen reader users land on the panel as soon as it opens.
  useEffect(() => {
    heading.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !locked) onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [locked, onClose]);

  return (
    <aside role="dialog" aria-labelledby={titleId} className={styles.panel}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h2 id={titleId} ref={heading} tabIndex={-1} className={styles.title}>
            {title}
          </h2>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          disabled={locked}
          aria-label="Cerrar panel"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      {children}
    </aside>
  );
}
