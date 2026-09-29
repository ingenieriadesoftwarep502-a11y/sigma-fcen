"use client";

import { ROLE_LABELS } from "@/lib/auth";

import { useSession } from "../session/session-provider";
import styles from "./home-overview.module.css";

/** First screen after signing in: who you are and with which roles, straight from the API. */
export default function HomeOverview() {
  const { session } = useSession();
  if (session.status !== "authenticated") return null;
  const { first_name, email, roles } = session.user;

  return (
    <section className={styles.overview} aria-labelledby="home-title">
      <h1 id="home-title" className={styles.title}>
        Hola{first_name ? `, ${first_name}` : ""}.
      </h1>
      <dl className={styles.facts}>
        <div>
          <dt>Correo</dt>
          <dd>{email}</dd>
        </div>
        <div>
          <dt>{roles.length === 1 ? "Rol" : "Roles"}</dt>
          <dd>
            <ul className={styles.roles}>
              {roles.map((role) => (
                <li key={role} className={styles.role}>
                  {ROLE_LABELS[role]}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>
    </section>
  );
}
