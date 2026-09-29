"use client";

import { useEffect, useState } from "react";

import Alert from "@/components/ui/alert";
import Button, { ButtonLink } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { useUsersExport } from "@/features/users/use-users-export";
import { requestErrorMessage } from "@/lib/api-client";
import { NEW_USER_PATH } from "@/lib/auth";
import { getUserSummary, NO_FILTERS, type UserSummary } from "@/lib/users";

import ActivityFeed from "./activity-feed";
import styles from "./admin-dashboard.module.css";
import RoleDistribution from "./role-distribution";
import SummaryFigures from "./summary-figures";

type SummaryState =
  | { status: "loading" }
  | { status: "ready"; summary: UserSummary }
  | { status: "error"; message: string };

type AdminDashboardProps = {
  firstName: string;
};

/**
 * Home for administrators: headline numbers, how accounts spread across roles, the
 * latest changes, and shortcuts to the two most common tasks. Container: owns the request.
 */
export default function AdminDashboard({ firstName }: AdminDashboardProps) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SummaryState>({ status: "loading" });
  const exporter = useUsersExport();

  useEffect(() => {
    const controller = new AbortController();
    getUserSummary(controller.signal).then(
      (summary) => {
        if (!controller.signal.aborted) setState({ status: "ready", summary });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ status: "error", message: requestErrorMessage(error) });
        }
      },
    );
    return () => controller.abort();
  }, [attempt]);

  function retry() {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Hola{firstName ? `, ${firstName}` : ""}.</h1>
          <p className={styles.lead}>Así están hoy las cuentas de SIGMA·FCEN.</p>
        </div>
        <div className={styles.actions}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => exporter.download(NO_FILTERS)}
            softDisabled={exporter.exporting}
          >
            <Icon name="download" />
            {exporter.exporting ? "Exportando…" : "Exportar usuarios"}
          </Button>
          <ButtonLink href={NEW_USER_PATH} size="sm">
            <Icon name="plus" />
            Nuevo usuario
          </ButtonLink>
        </div>
      </header>

      {exporter.error && <Alert tone="error">{exporter.error}</Alert>}

      {state.status === "error" && (
        <div className={styles.failure}>
          <Alert tone="error">{state.message}</Alert>
          <Button variant="ghost" size="sm" onClick={retry}>
            <Icon name="refresh" />
            Intentar de nuevo
          </Button>
        </div>
      )}

      {state.status === "loading" && (
        <>
          <p role="status" className="sr-only">
            Cargando resumen…
          </p>
          <div className={styles.skeleton} aria-hidden="true">
            <div className={styles.skeletonBand} />
            <div className={styles.columns}>
              <div className={styles.skeletonBlock} />
              <div className={styles.skeletonBlock} />
            </div>
          </div>
        </>
      )}

      {state.status === "ready" && (
        <>
          <SummaryFigures summary={state.summary} />
          <div className={styles.columns}>
            <RoleDistribution counts={state.summary.by_role} />
            <ActivityFeed entries={state.summary.recent_activity} />
          </div>
        </>
      )}
    </div>
  );
}
