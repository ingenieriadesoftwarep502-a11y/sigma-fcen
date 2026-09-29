"use client";

import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import Icon from "@/components/ui/icon";
import { useDialog } from "@/lib/use-dialog";

import styles from "./app-shell.module.css";

type AppShellProps = {
  /** Links to the sections of the app, placed in the sidebar. */
  navigation: ReactNode;
  /** The signed-in account, pinned to the bottom of the sidebar. */
  account: ReactNode;
  children: ReactNode;
};

/** Wide enough for the sidebar to stay in view; below it the sidebar goes off-canvas. */
const WIDE_QUERY = "(min-width: 900px)";

function Brand() {
  return (
    <p className={styles.brand}>
      SIGMA<span className={styles.brandAccent}>·FCEN</span>
    </p>
  );
}

/**
 * Frame of every signed-in page: a sidebar with the brand, the navigation and the
 * account; the page content beside it. On narrow screens the sidebar opens over the
 * content from a menu button, as a modal: Escape or the scrim close it, and so does
 * moving to another page.
 */
export default function AppShell({ navigation, account, children }: AppShellProps) {
  const pathname = usePathname();
  // The page the menu was opened on: navigating anywhere else closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const sidebarId = useId();
  const sidebar = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);

  function close() {
    setOpenOn(null);
    menuButton.current?.focus();
  }

  useDialog(sidebar, { active: open, onDismiss: close });

  useEffect(() => {
    if (!open) return;
    const firstTarget = sidebar.current?.querySelector<HTMLElement>(
      "nav a[href], nav button:not([disabled])",
    );
    firstTarget?.focus();

    // Growing past the breakpoint turns the sidebar back into a fixed column.
    if (typeof window.matchMedia !== "function") return;
    const wide = window.matchMedia(WIDE_QUERY);
    const onChange = () => {
      if (wide.matches) setOpenOn(null);
    };
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, [open]);

  return (
    <div className={styles.shell} data-nav={open ? "open" : "closed"}>
      <a href="#contenido" className={styles.skip}>
        Saltar al contenido
      </a>

      <header className={styles.topbar}>
        <button
          ref={menuButton}
          type="button"
          className={styles.iconButton}
          aria-label="Abrir menú"
          aria-expanded={open}
          aria-controls={sidebarId}
          onClick={() => setOpenOn(pathname)}
        >
          <Icon name="menu" size={20} />
        </button>
        <Brand />
      </header>

      <div className={styles.scrim} data-testid="sidebar-scrim" aria-hidden="true" onClick={close} />

      <aside
        id={sidebarId}
        ref={sidebar}
        className={styles.sidebar}
        role={open ? "dialog" : undefined}
        aria-modal={open || undefined}
        aria-label={open ? "Menú" : undefined}
      >
        <div className={styles.sidebarHead}>
          <Brand />
          <button
            type="button"
            className={`${styles.iconButton} ${styles.closeMenu}`}
            aria-label="Cerrar menú"
            onClick={close}
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <nav aria-label="Principal" className={styles.nav}>
          {navigation}
        </nav>
        <div className={styles.account}>{account}</div>
      </aside>

      <main id="contenido" tabIndex={-1} className={styles.main}>
        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}
