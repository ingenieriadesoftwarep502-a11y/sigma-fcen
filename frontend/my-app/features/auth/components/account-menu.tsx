"use client";

import { useState } from "react";

import Avatar from "@/components/ui/avatar";
import Icon from "@/components/ui/icon";
import { requestErrorMessage } from "@/lib/api-client";
import { ROLE_LABELS } from "@/lib/auth";
import { displayName, initialsOf, primaryRole } from "@/lib/people";

import { useSession } from "../session/session-provider";
import styles from "./account-menu.module.css";

/** The signed-in person at the foot of the sidebar, and the way out. */
export default function AccountMenu() {
  const { session, signOut } = useSession();
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session.status !== "authenticated") return null;
  const { user } = session;
  const role = primaryRole(user.roles);

  async function handleSignOut() {
    if (leaving) return;
    setLeaving(true);
    setError(null);
    try {
      await signOut();
    } catch (failure) {
      // The session is still open on the server: say so instead of pretending.
      setError(requestErrorMessage(failure));
      setLeaving(false);
    }
  }

  return (
    <div className={styles.account}>
      <div className={styles.identity}>
        <Avatar initials={initialsOf(user)} />
        <div className={styles.text}>
          <span className={styles.name}>{displayName(user)}</span>
          {role && <span className={styles.role}>{ROLE_LABELS[role]}</span>}
        </div>
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <button
        type="button"
        className={styles.signOut}
        onClick={handleSignOut}
        // Not `disabled`: a focused button that becomes disabled drops keyboard focus.
        aria-disabled={leaving || undefined}
      >
        <Icon name="logout" />
        {leaving ? "Cerrando…" : "Cerrar sesión"}
      </button>
    </div>
  );
}
