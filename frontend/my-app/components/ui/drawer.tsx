"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";

import Icon from "@/components/ui/icon";
import { useDialog } from "@/lib/use-dialog";

import styles from "./drawer.module.css";

type DrawerProps = {
  title: string;
  /** Shown under the title, e.g. the email of the account or the code of the subject. */
  subtitle?: string;
  /** While a change is being stored, the drawer cannot be closed. */
  locked?: boolean;
  onClose: () => void;
  children: ReactNode;
};

/**
 * Modal drawer that slides in from the right over a list (full width on small
 * screens), for creating or editing one of its items. Focus stays inside while it is open; Escape, the scrim and the close button
 * dismiss it unless a save is in flight. The caller puts focus back on what opened it.
 */
export default function Drawer({
  title,
  subtitle,
  locked = false,
  onClose,
  children,
}: DrawerProps) {
  const titleId = useId();
  const drawer = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useDialog(drawer, { locked, onDismiss: onClose });

  // Keyboard and screen reader users land on the drawer as soon as it opens.
  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <div className={styles.layer}>
      <div
        className={styles.scrim}
        data-testid="drawer-scrim"
        aria-hidden="true"
        onClick={() => {
          if (!locked) onClose();
        }}
      />
      <aside
        ref={drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={styles.drawer}
      >
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
            <Icon name="close" size={20} />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
      </aside>
    </div>
  );
}
