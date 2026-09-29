"use client";

import { type FormEvent, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import TextField from "@/components/ui/text-field";
import { formErrors } from "@/lib/api-client";
import type { RoleCode } from "@/lib/auth";
import { type AdminUser, createUser } from "@/lib/users";

import RoleCheckboxes from "./role-checkboxes";
import styles from "./user-form.module.css";

const FIELDS = ["first_name", "last_name", "email", "password", "roles"] as const;
type Errors = Partial<Record<(typeof FIELDS)[number], string[]>>;

type UserCreateFormProps = {
  onCreated: (user: AdminUser) => void;
  onBusyChange: (busy: boolean) => void;
};

/** An administrator creates an active account and picks its roles (CA-HU11-1). */
export default function UserCreateForm({ onCreated, onBusyChange }: UserCreateFormProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roles, setRoles] = useState<RoleCode[]>(["STUDENT"]);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const missing: Errors = {};
    if (!firstName.trim()) missing.first_name = ["Ingresa el nombre."];
    if (!lastName.trim()) missing.last_name = ["Ingresa el apellido."];
    if (!email.trim()) missing.email = ["Ingresa el correo."];
    if (!password) missing.password = ["Ingresa una contraseña."];
    if (roles.length === 0) missing.roles = ["Selecciona al menos un rol."];
    setErrors(missing);
    setFormError(null);
    if (Object.keys(missing).length > 0) return;

    setSubmitting(true);
    onBusyChange(true);
    let user: AdminUser;
    try {
      user = await createUser({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        password,
        roles,
      });
    } catch (error) {
      // Email and password rules (RN-001.1, RN-001.2, password strength) live on the server.
      const { byField, message } = formErrors(error, FIELDS);
      setErrors(byField);
      setFormError(message);
      setSubmitting(false);
      onBusyChange(false);
      return;
    }
    onCreated(user);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className={styles.form}>
      {formError && <Alert tone="error">{formError}</Alert>}
      <div className={styles.pair}>
        <TextField
          id="new-user-first-name"
          label="Nombre"
          autoComplete="off"
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          errors={errors.first_name}
          variant="glass"
        />
        <TextField
          id="new-user-last-name"
          label="Apellido"
          autoComplete="off"
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
          errors={errors.last_name}
          variant="glass"
        />
      </div>
      <TextField
        id="new-user-email"
        label="Correo institucional"
        type="email"
        autoComplete="off"
        placeholder="nombre@unal.edu.co"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        errors={errors.email}
        variant="glass"
      />
      <TextField
        id="new-user-password"
        label="Contraseña inicial"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        errors={errors.password}
        variant="glass"
      />
      <RoleCheckboxes id="new-user-roles" value={roles} onChange={setRoles} errors={errors.roles} />
      <Button type="submit" disabled={submitting} className={styles.submit}>
        {submitting ? "Creando…" : "Crear usuario"}
      </Button>
    </form>
  );
}
