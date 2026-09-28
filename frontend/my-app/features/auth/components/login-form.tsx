"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import TextField from "@/components/ui/text-field";
import { formErrors } from "@/lib/api-client";
import { login } from "@/lib/auth";

import styles from "./auth-form.module.css";

const FIELDS = ["email", "password"] as const;
type Errors = Partial<Record<(typeof FIELDS)[number], string[]>>;

type LoginFormProps = {
  /** Internal path to open after signing in; already checked by `safeRedirectPath`. */
  redirectTo: string;
};

export default function LoginForm({ redirectTo }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const missing: Errors = {};
    if (!email.trim()) missing.email = ["Ingresa tu correo."];
    if (!password) missing.password = ["Ingresa tu contraseña."];
    setErrors(missing);
    setFormError(null);
    if (Object.keys(missing).length > 0) return;

    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (error) {
      const { byField, message } = formErrors(error, FIELDS);
      setErrors(byField);
      setFormError(message);
      setSubmitting(false);
      return;
    }
    // Replace, not push: going back must not return to the login form.
    router.replace(redirectTo);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className={styles.form}>
      {formError && <Alert tone="error">{formError}</Alert>}
      <TextField
        id="email"
        label="Correo institucional"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        errors={errors.email}
        variant="glass"
      />
      <TextField
        id="password"
        label="Contraseña"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        errors={errors.password}
        variant="glass"
      />
      <Button type="submit" disabled={submitting} className={styles.submit}>
        {submitting ? "Ingresando…" : "Iniciar sesión"}
      </Button>
      <p className={styles.footer}>
        ¿No tienes cuenta?{" "}
        <Link href="/register" className={styles.link}>
          Crear una cuenta
        </Link>
      </p>
    </form>
  );
}
