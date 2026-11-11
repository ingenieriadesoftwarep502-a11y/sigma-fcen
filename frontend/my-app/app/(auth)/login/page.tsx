import type { Metadata } from "next";

import { AuthHeading } from "@/components/layouts/auth-shell/auth-shell";
import Alert from "@/components/ui/alert";
import LoginForm from "@/features/auth/components/login-form";
import { safeRedirectPath } from "@/lib/auth";

export const metadata: Metadata = { title: "Iniciar sesión · SIGMA-FCEN" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { registered, next } = await searchParams;

  return (
    <>
      <AuthHeading title="Iniciar sesión" subtitle="Ingresa con tu correo @unal.edu.co." />
      {registered === "1" && (
        <Alert tone="success">Tu cuenta fue creada. Inicia sesión para continuar.</Alert>
      )}
      <LoginForm redirectTo={safeRedirectPath(next)} />
    </>
  );
}
