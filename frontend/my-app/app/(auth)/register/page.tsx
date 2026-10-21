import type { Metadata } from "next";

import { AuthHeading } from "@/components/layouts/auth-shell/auth-shell";
import RegisterForm from "@/features/auth/components/register-form";

export const metadata: Metadata = { title: "Crear cuenta · SIGMA-FCEN" };

export default function RegisterPage() {
  return (
    <>
      <AuthHeading
        title="Crear cuenta"
        subtitle="Regístrate con tu correo institucional. Tu cuenta tendrá el rol de estudiante."
      />
      <RegisterForm />
    </>
  );
}
