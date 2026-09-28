import type { Metadata } from "next";

import LoginForm from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión · SIGMA-FCEN" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { registered } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-sm flex-col gap-6 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Iniciar sesión
        </h1>
        {registered === "1" && (
          <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
            Tu cuenta fue creada. Inicia sesión para continuar.
          </p>
        )}
        <LoginForm />
      </main>
    </div>
  );
}
