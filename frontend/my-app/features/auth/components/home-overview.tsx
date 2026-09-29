"use client";

import RoleTags from "@/components/ui/role-tag";

import { useSession } from "../session/session-provider";
import styles from "./home-overview.module.css";

/** First screen for everyone but administrators: who you are and with which roles. */
export default function HomeOverview() {
  const { session } = useSession();
  if (session.status !== "authenticated") return null;
  const { first_name, email, roles } = session.user;

  return (
    <section className={styles.overview} aria-labelledby="home-title">
      <header>
        <h1 id="home-title" className={styles.title}>
          Hola{first_name ? `, ${first_name}` : ""}.
        </h1>
        <p className={styles.lead}>Esta es tu cuenta en SIGMA·FCEN.</p>
      </header>
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>Correo</dt>
          <dd>{email}</dd>
        </div>
        <div className={styles.fact}>
          <dt>{roles.length === 1 ? "Rol" : "Roles"}</dt>
          <dd>
            <RoleTags roles={roles} />
          </dd>
        </div>
      </dl>
    </section>
  );
}
