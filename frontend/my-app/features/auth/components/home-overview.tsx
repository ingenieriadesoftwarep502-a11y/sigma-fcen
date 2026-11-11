"use client";

import { useSession } from "../session/session-provider";
import styles from "./home-overview.module.css";

/** Greeting on the first screen for everyone but administrators. */
export default function HomeOverview() {
  const { session } = useSession();
  if (session.status !== "authenticated") return null;
  const { first_name } = session.user;

  return (
    <section className={styles.overview} aria-labelledby="home-title">
      <header>
        <h1 id="home-title" className={styles.title}>
          Hola{first_name ? `, ${first_name}` : ""}.
        </h1>
        <p className={styles.lead}>Esta es tu cuenta en SIGMA·FCEN.</p>
      </header>
    </section>
  );
}
