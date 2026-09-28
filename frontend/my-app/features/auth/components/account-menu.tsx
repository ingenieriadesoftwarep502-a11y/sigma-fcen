"use client";

import { useState } from "react";

import Button from "@/components/ui/button";
import { requestErrorMessage } from "@/lib/api-client";

import { useSession } from "../session/session-provider";
import styles from "./account-menu.module.css";

/** The signed-in person's name and the way out. */
export default function AccountMenu() {
  const { session, signOut } = useSession();
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session.status !== "authenticated") return null;
  const { first_name, last_name, email } = session.user;

  async function handleSignOut() {
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
    <div className={styles.menu}>
      <div className={styles.identity}>
        <span className={styles.name}>{`${first_name} ${last_name}`.trim() || email}</span>
        <span className={styles.email}>{email}</span>
      </div>
      <Button variant="ghost" onClick={handleSignOut} disabled={leaving}>
        {leaving ? "Cerrando…" : "Cerrar sesión"}
      </Button>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
