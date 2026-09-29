"use client";

import { useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import { requestErrorMessage } from "@/lib/api-client";
import { type AdminUser, deactivateUser, updateUser } from "@/lib/users";

import styles from "./user-form.module.css";

type AccountStatusProps = {
  user: AdminUser;
  onSaved: (message: string) => void;
  locked: boolean;
  onBusyChange: (busy: boolean) => void;
};

function impactMessage(reservations: number): string {
  if (reservations === 0) return "Esta cuenta no tiene reservas futuras.";
  if (reservations === 1) return "Esta cuenta tiene 1 reserva futura que quedará afectada.";
  return `Esta cuenta tiene ${reservations} reservas futuras que quedarán afectadas.`;
}

/**
 * Whether the account can sign in. Deactivating shows the impact first and asks for
 * confirmation (CA-HU11-3); reactivating is a plain update.
 */
export default function AccountStatus({ user, onSaved, locked, onBusyChange }: AccountStatusProps) {
  // Future reservations reported by the API; set only while confirmation is pending.
  const [impact, setImpact] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    onBusyChange(true);
    setError(null);
    try {
      await action();
    } catch (failure) {
      // e.g. "No puedes desactivar tu propia cuenta." or the last-admin rule.
      setError(requestErrorMessage(failure));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  const askImpact = () =>
    run(async () => {
      const result = await deactivateUser(user.id, { confirm: false });
      setImpact(result.impact.future_reservations);
    });

  const confirmDeactivation = () =>
    run(async () => {
      await deactivateUser(user.id, { confirm: true });
      onSaved(`Se desactivó la cuenta de ${user.email}.`);
    });

  const reactivate = () =>
    run(async () => {
      await updateUser(user.id, { is_active: true });
      onSaved(`Se reactivó la cuenta de ${user.email}.`);
    });

  return (
    <section className={styles.access} aria-labelledby="account-access-title">
      <h3 id="account-access-title" className={styles.sectionTitle}>
        Acceso
      </h3>
      {error && <Alert tone="error">{error}</Alert>}

      {!user.is_active && (
        <>
          <p className={styles.note}>La cuenta está inactiva: no puede iniciar sesión.</p>
          <Button variant="ghost" onClick={reactivate} disabled={busy || locked}>
            {busy ? "Reactivando…" : "Reactivar cuenta"}
          </Button>
        </>
      )}

      {user.is_active && impact === null && (
        <>
          <p className={styles.note}>La cuenta está activa.</p>
          <Button variant="ghost" onClick={askImpact} disabled={busy || locked}>
            {busy ? "Consultando…" : "Desactivar cuenta"}
          </Button>
        </>
      )}

      {user.is_active && impact !== null && (
        <div className={styles.confirm}>
          <p>
            {impactMessage(impact)} Al desactivarla, la persona pierde el acceso de inmediato.
          </p>
          <div className={styles.actions}>
            <Button variant="danger" onClick={confirmDeactivation} disabled={busy || locked}>
              {busy ? "Desactivando…" : "Confirmar desactivación"}
            </Button>
            <Button variant="ghost" onClick={() => setImpact(null)} disabled={busy || locked}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
