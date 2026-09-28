"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import TextField from "@/components/ui/text-field";
import { formErrors } from "@/lib/api-client";
import {
  HOME_PATH,
  INSTITUTIONAL_EMAIL_DOMAIN,
  isInstitutionalEmail,
  login,
  register,
  type RegisterData,
} from "@/lib/auth";

import styles from "./auth-form.module.css";

const FIELDS = ["first_name", "last_name", "email", "password"] as const;
type Field = (typeof FIELDS)[number];
type Errors = Partial<Record<Field, string[]>>;

const EMPTY: RegisterData = { first_name: "", last_name: "", email: "", password: "" };

function validate(data: RegisterData): Errors {
  const errors: Errors = {};
  if (!data.first_name.trim()) errors.first_name = ["Ingresa tu nombre."];
  if (!data.last_name.trim()) errors.last_name = ["Ingresa tu apellido."];
  if (!data.email.trim()) {
    errors.email = ["Ingresa tu correo."];
  } else if (!isInstitutionalEmail(data.email.trim())) {
    errors.email = [`Usa tu correo institucional @${INSTITUTIONAL_EMAIL_DOMAIN}.`];
  }
  if (!data.password) errors.password = ["Ingresa una contraseña."];
  return errors;
}

export default function RegisterForm() {
  const router = useRouter();
  const [data, setData] = useState<RegisterData>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update(field: Field) {
    return (event: ChangeEvent<HTMLInputElement>) =>
      setData((current) => ({ ...current, [field]: event.target.value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clientErrors = validate(data);
    setErrors(clientErrors);
    setFormError(null);
    if (Object.keys(clientErrors).length > 0) return;

    const payload = { ...data, email: data.email.trim() };
    setSubmitting(true);
    try {
      await register(payload);
    } catch (error) {
      const { byField, message } = formErrors(error, FIELDS);
      setErrors(byField);
      setFormError(message);
      setSubmitting(false);
      return;
    }

    try {
      // Self-registration yields an active account (ADR-009): sign in right away.
      await login(payload.email, payload.password);
      router.replace(HOME_PATH);
    } catch {
      // The account already exists, so a registration error would mislead.
      router.replace("/login?registered=1");
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className={styles.form}>
      {formError && <Alert tone="error">{formError}</Alert>}
      <TextField
        id="first_name"
        label="Nombre"
        autoComplete="given-name"
        value={data.first_name}
        onChange={update("first_name")}
        errors={errors.first_name}
        variant="glass"
      />
      <TextField
        id="last_name"
        label="Apellido"
        autoComplete="family-name"
        value={data.last_name}
        onChange={update("last_name")}
        errors={errors.last_name}
        variant="glass"
      />
      <TextField
        id="email"
        label="Correo institucional"
        type="email"
        autoComplete="email"
        placeholder={`usuario@${INSTITUTIONAL_EMAIL_DOMAIN}`}
        value={data.email}
        onChange={update("email")}
        errors={errors.email}
        variant="glass"
      />
      <TextField
        id="password"
        label="Contraseña"
        type="password"
        autoComplete="new-password"
        value={data.password}
        onChange={update("password")}
        errors={errors.password}
        variant="glass"
      />
      <Button type="submit" disabled={submitting} className={styles.submit}>
        {submitting ? "Creando cuenta…" : "Crear cuenta"}
      </Button>
      <p className={styles.footer}>
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className={styles.link}>
          Iniciar sesión
        </Link>
      </p>
    </form>
  );
}
