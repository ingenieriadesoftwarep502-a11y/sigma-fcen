import type { Metadata } from "next";
import Image from "next/image";

import CampusCarousel from "@/components/login/campus-carousel";
import GlassCard from "@/components/login/glass-card";
import logo from "@/public/images/login/logo-unal-blanco.png";

import LoginForm from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión · SIGMA-FCEN" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { registered } = await searchParams;

  return (
    <div className="login-scene">
      <CampusCarousel />

      <div className="login-layout">
        <section className="login-brand">
          <p className="login-wordmark">
            SIGMA<span className="italic">·FCEN</span>
          </p>
          <p className="login-tagline">
            Monitorías académicas de la Facultad de Ciencias Exactas y Naturales.
          </p>
        </section>

        <main className="login-card-slot">
          <GlassCard>
            <Image
              src={logo}
              alt="Universidad Nacional de Colombia"
              width={378}
              height={161}
              preload
              className="login-logo"
            />
            <div className="login-rule" />
            <header className="flex flex-col gap-1.5">
              <h1 className="font-display text-[2.5rem] leading-none text-white">
                Iniciar sesión
              </h1>
              <p className="text-sm text-white/70">Ingresa con tu correo @unal.edu.co.</p>
            </header>
            {registered === "1" && (
              <p role="status" className="login-notice">
                Tu cuenta fue creada. Inicia sesión para continuar.
              </p>
            )}
            <LoginForm />
          </GlassCard>
        </main>
      </div>
    </div>
  );
}
