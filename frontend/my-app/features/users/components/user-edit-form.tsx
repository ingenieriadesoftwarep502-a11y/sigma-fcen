"use client";

import { type FormEvent, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import TextField from "@/components/ui/text-field";
import { formErrors } from "@/lib/api-client";
import type { RoleCode } from "@/lib/auth";
import { type AdminUser, setUserRoles, updateUser } from "@/lib/users";

import AccountStatus from "./account-status";
import RoleCheckboxes from "./role-checkboxes";
import styles from "./user-form.module.css";

const FIELDS = ["first_name", "last_name", "roles"] as const;
type Errors = Partial<Record<(typeof FIELDS)[number], string[]>>;

type UserEditFormProps = {
  user: AdminUser;
  /** Called with the confirmation to show once a change is stored. */
  onSaved: (message: string) => void;
  /** Another change for this panel is in flight (shared with the access controls). */
  locked: boolean;
  onBusyChange: (busy: boolean) => void;
};

function sameRoles(a: readonly RoleCode[], b: readonly RoleCode[]): boolean {
  return a.length === b.length && a.every((role) => b.includes(role));
}

/**
 * Edits names and roles, and manages the account's access. Names and roles are separate
 * endpoints, so only the ones that changed are sent (RF-021).
 */
export default function UserEditForm({ user, onSaved, locked, onBusyChange }: UserEditFormProps) {
  const [firstName, setFirstName] = useState(user.first_name);
  const [lastName, setLastName] = useState(user.last_name);
  const [roles, setRoles] = useState<RoleCode[]>(user.roles);
  // What the server holds now: a failed role change must not resend names already saved.
  const [saved, setSaved] = useState({
    first_name: user.first_name,
    last_name: user.last_name,
    roles: user.roles,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const names = { first_name: firstName.trim(), last_name: lastName.trim() };
    const missing: Errors = {};
    if (!names.first_name) missing.first_name = ["Ingresa el nombre."];
    if (!names.last_name) missing.last_name = ["Ingresa el apellido."];
    if (roles.length === 0) missing.roles = ["Selecciona al menos un rol."];
    setErrors(missing);
    setFormError(null);
    if (Object.keys(missing).length > 0) return;

    const namesChanged =
      names.first_name !== saved.first_name || names.last_name !== saved.last_name;
    const rolesChanged = !sameRoles(roles, saved.roles);
    if (!namesChanged && !rolesChanged) {
      setFormError("No hay cambios por guardar.");
      return;
    }

    setSubmitting(true);
    onBusyChange(true);
    try {
      if (namesChanged) {
        await updateUser(user.id, names);
        setSaved((current) => ({ ...current, ...names }));
      }
      if (rolesChanged) {
        // The API refuses to leave the system without an active administrator.
        await setUserRoles(user.id, roles);
      }
    } catch (error) {
      const { byField, message } = formErrors(error, FIELDS);
      setErrors(byField);
      setFormError(message);
      setSubmitting(false);
      onBusyChange(false);
      return;
    }
    onSaved(`Se guardaron los cambios de ${user.email}.`);
  }

  return (
    <div className={styles.stack}>
      <form onSubmit={handleSubmit} noValidate className={styles.form}>
        {formError && <Alert tone="error">{formError}</Alert>}
        <div className={styles.pair}>
          <TextField
            id="edit-user-first-name"
            label="Nombre"
            autoComplete="off"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            errors={errors.first_name}
            variant="glass"
          />
          <TextField
            id="edit-user-last-name"
            label="Apellido"
            autoComplete="off"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            errors={errors.last_name}
            variant="glass"
          />
        </div>
        <RoleCheckboxes id="edit-user-roles" value={roles} onChange={setRoles} errors={errors.roles} />
        <Button type="submit" disabled={submitting || locked} className={styles.submit}>
          {submitting ? "Guardando…" : "Guardar cambios"}
        </Button>
      </form>
      <AccountStatus user={user} locked={locked} onSaved={onSaved} onBusyChange={onBusyChange} />
    </div>
  );
}
