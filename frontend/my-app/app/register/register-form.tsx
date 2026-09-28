"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import TextField from "@/components/text-field";
import { fieldErrors, requestErrorMessage } from "@/lib/api-client";
import {
  INSTITUTIONAL_EMAIL_DOMAIN,
  isInstitutionalEmail,
  login,
  register,
  type RegisterData,
} from "@/lib/auth";

type Field = keyof RegisterData;
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
    return (event: React.ChangeEvent<HTMLInputElement>) =>
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
      // Self-registration yields an active account (ADR-009): sign in right away.
      await login(payload.email, payload.password);
      router.push("/");
    } catch (error) {
      const serverErrors = fieldErrors(error);
      if (Object.keys(serverErrors).length > 0) {
        setErrors(serverErrors);
      } else {
        setFormError(requestErrorMessage(error));
      }
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
        id="first_name"
        label="Nombre"
        autoComplete="given-name"
        value={data.first_name}
        onChange={update("first_name")}
        errors={errors.first_name}
      />
      <TextField
        id="last_name"
        label="Apellido"
        autoComplete="family-name"
        value={data.last_name}
        onChange={update("last_name")}
        errors={errors.last_name}
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
      />
      <TextField
        id="password"
        label="Contraseña"
        type="password"
        autoComplete="new-password"
        value={data.password}
        onChange={update("password")}
        errors={errors.password}
      />
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {submitting ? "Creando cuenta…" : "Crear cuenta"}
      </button>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-medium underline">
          Iniciar sesión
        </Link>
      </p>
    </form>
  );
}
