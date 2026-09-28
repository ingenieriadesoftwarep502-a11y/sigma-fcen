import type { Metadata } from "next";

import RegisterForm from "./register-form";

export const metadata: Metadata = { title: "Crear cuenta · SIGMA-FCEN" };

export default function RegisterPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-sm flex-col gap-6 px-6 py-16">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Crear cuenta
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Regístrate con tu correo institucional. Tu cuenta tendrá el rol de estudiante.
          </p>
        </div>
        <RegisterForm />
      </main>
    </div>
  );
}
