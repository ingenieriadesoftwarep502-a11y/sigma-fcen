"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import TextField from "@/components/text-field";
import { requestErrorMessage } from "@/lib/api-client";
import { login } from "@/lib/auth";

type Errors = { email?: string[]; password?: string[] };

export default function LoginForm() {
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
      router.push("/");
    } catch (error) {
      setFormError(requestErrorMessage(error));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {formError && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {formError}
        </p>
      )}
      <TextField
        id="email"
        label="Correo institucional"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        errors={errors.email}
      />
      <TextField
        id="password"
        label="Contraseña"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        errors={errors.password}
      />
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {submitting ? "Ingresando…" : "Iniciar sesión"}
      </button>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        ¿No tienes cuenta?{" "}
        <Link href="/register" className="font-medium underline">
          Crear una cuenta
        </Link>
      </p>
    </form>
  );
}
