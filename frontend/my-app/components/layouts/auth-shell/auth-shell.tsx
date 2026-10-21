import Image from "next/image";
import type { ReactNode } from "react";

import logo from "@/public/images/login/logo-unal-blanco.png";

import styles from "./auth-shell.module.css";
import CampusCarousel from "./campus-carousel";
import GlassCard from "./glass-card";

/**
 * Full-screen campus photography with the UNAL-branded card that holds an auth form.
 * Lives in the (auth) layout, so the carousel keeps running between login and register.
 */
export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.scene}>
      <CampusCarousel />

      <div className={styles.layout}>
        <section className={styles.brand}>
          <p className={styles.wordmark}>
            SIGMA<span className={styles.wordmarkAccent}>·FCEN</span>
          </p>
          <p className={styles.tagline}>
            Monitorías académicas de la Facultad de Ciencias Exactas y Naturales.
          </p>
        </section>

        <main className={styles.slot}>
          <GlassCard>
            <Image
              src={logo}
              alt="Universidad Nacional de Colombia"
              width={378}
              height={161}
              preload
              className={styles.logo}
            />
            <div className={styles.rule} />
            {children}
          </GlassCard>
        </main>
      </div>
    </div>
  );
}

/** Title and one line of guidance at the top of the auth card. */
export function AuthHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.subtitle}>{subtitle}</p>
    </header>
  );
}
