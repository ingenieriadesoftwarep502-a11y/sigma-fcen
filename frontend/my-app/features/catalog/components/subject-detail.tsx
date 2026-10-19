"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import Alert from "@/components/ui/alert";
import Avatar from "@/components/ui/avatar";
import Button, { ButtonLink } from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import Icon from "@/components/ui/icon";
import SlotSearch from "@/features/availability/components/slot-search";
import { useSession } from "@/features/auth/session/session-provider";
import { ApiError, requestErrorMessage } from "@/lib/api-client";
import { SUBJECTS_PATH } from "@/lib/auth";
import { getSubject, listSubjectMonitors, type Subject, type SubjectMonitor } from "@/lib/catalog";
import { initialsOfFullName } from "@/lib/people";

import { creditsLabel } from "../labels";
import { usePinnedSubjects } from "../pinned-subjects";
import { useTerms } from "../use-catalog-reference";
import styles from "./subject-detail.module.css";

type Loaded<T> =
  | { status: "loading" }
  | { status: "ready"; attempt: number; data: T }
  | { status: "missing"; attempt: number }
  | { status: "error"; attempt: number; message: string };

/** Reads one thing for the subject in view, again on `retry`; a 404 is "missing". */
function useSubjectData<T>(
  subjectId: number,
  load: (id: number, signal: AbortSignal) => Promise<T>,
) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Loaded<T>>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    load(subjectId, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: "ready", attempt, data });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 404) {
          setState({ status: "missing", attempt });
        } else {
          setState({ status: "error", attempt, message: requestErrorMessage(error) });
        }
      },
    );
    return () => controller.abort();
  }, [subjectId, load, attempt]);

  const settled = state.status !== "loading" && state.attempt === attempt;
  return {
    state: settled ? state : ({ status: "loading" } as const),
    retry: () => setAttempt((value) => value + 1),
  };
}

// Module-level so the effects above do not run again on every render.
const loadSubject = (id: number, signal: AbortSignal) => getSubject(id, null, signal);
const loadMonitors = listSubjectMonitors;

function MonitorList({ subject, term }: { subject: Subject; term: string | null }) {
  const { state, retry } = useSubjectData<SubjectMonitor[]>(subject.id, loadMonitors);

  return (
    <section className={styles.monitors} aria-labelledby="subject-monitors-title">
      <h2 id="subject-monitors-title" className={styles.sectionTitle}>
        {term ? `Monitores del período ${term}` : "Monitores del período"}
      </h2>
      {state.status === "loading" && (
        <p role="status" className={styles.muted}>
          Cargando monitores…
        </p>
      )}
      {state.status === "error" && (
        <div className={styles.failure}>
          <Alert tone="error">{state.message}</Alert>
          <Button variant="ghost" size="sm" onClick={retry}>
            <Icon name="refresh" />
            Intentar de nuevo
          </Button>
        </div>
      )}
      {state.status === "ready" && state.data.length === 0 && (
        <p className={styles.muted}>Esta asignatura no tiene monitores en el período.</p>
      )}
      {state.status === "ready" && state.data.length > 0 && (
        <ul className={styles.monitorList} aria-label={`Monitores de ${subject.name}`}>
          {state.data.map((monitor) => (
            <li key={monitor.id} className={styles.monitor}>
              <Avatar initials={initialsOfFullName(monitor.full_name, "?")} size="sm" />
              <span>{monitor.full_name || "Monitor sin nombre"}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One subject as a student sees it: what it is, its monitors of the current term and their
 * upcoming slots, which take the place of the old standalone search. Read-only: booking
 * arrives in FASE-04. Container: owns the subject, its monitors and the current term.
 */
export default function SubjectDetail({ subjectId }: { subjectId: number }) {
  const { session } = useSession();
  if (session.status !== "authenticated") return null;
  return <Detail subjectId={subjectId} userId={session.user.id} />;
}

function Detail({ subjectId, userId }: { subjectId: number; userId: string }) {
  const { state, retry } = useSubjectData<Subject>(subjectId, loadSubject);
  const { terms, current, error: termsError } = useTerms();
  const pins = usePinnedSubjects(userId);
  // The slots wait for the current term, so they never show another term's first.
  const termKnown = terms !== null || termsError !== null;
  const term = current?.code ?? null;

  return (
    <article className={styles.page} aria-labelledby="subject-title">
      <Link href={SUBJECTS_PATH} className={styles.back}>
        <Icon name="chevron" className={styles.backIcon} />
        Asignaturas
      </Link>

      {state.status === "loading" && (
        <>
          <p role="status" className="sr-only">
            Cargando la asignatura…
          </p>
          <div className={styles.skeleton} aria-hidden="true" />
        </>
      )}

      {state.status === "missing" && (
        <div className={styles.empty}>
          <EmptyState
            title="No encontramos esta asignatura."
            action={
              <ButtonLink href={SUBJECTS_PATH} variant="ghost" size="sm">
                Volver a Asignaturas
              </ButtonLink>
            }
          >
            <p>Puede que ya no se ofrezca. Búscala de nuevo en el catálogo.</p>
          </EmptyState>
        </div>
      )}

      {state.status === "error" && (
        <div className={styles.failure}>
          <Alert tone="error">{state.message}</Alert>
          <Button variant="ghost" size="sm" onClick={retry}>
            <Icon name="refresh" />
            Intentar de nuevo
          </Button>
        </div>
      )}

      {state.status === "ready" && (
        <>
          <header className={styles.header}>
            <div className={styles.heading}>
              <p className={styles.meta}>
                <span className={styles.code}>{state.data.code}</span>
                <span aria-hidden="true">·</span>
                <span>{creditsLabel(state.data.credits)}</span>
              </p>
              <h1 id="subject-title" className={styles.title}>
                {state.data.name}
              </h1>
              <p className={styles.department}>{state.data.department.name}</p>
            </div>
            <button
              type="button"
              className={styles.pin}
              aria-pressed={pins.isPinned(state.data.id)}
              aria-label={`Fijar ${state.data.name} en Mis asignaturas`}
              title={
                pins.isPinned(state.data.id) ? "Quitar de Mis asignaturas" : "Fijar en Mis asignaturas"
              }
              onClick={() => pins.toggle(state.data.id)}
            >
              <Icon
                name="bookmark"
                size={20}
                fill={pins.isPinned(state.data.id) ? "currentColor" : "none"}
              />
            </button>
          </header>

          <MonitorList subject={state.data} term={term} />

          {termKnown && (
            <SlotSearch
              key={term ?? "all"}
              subject={{ id: state.data.id, code: state.data.code, name: state.data.name }}
              term={term}
            />
          )}
        </>
      )}
    </article>
  );
}
