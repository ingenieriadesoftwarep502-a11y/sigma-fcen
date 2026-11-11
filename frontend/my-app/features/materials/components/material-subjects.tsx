"use client";

import Link from "next/link";
import { type CSSProperties, useEffect, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import Icon from "@/components/ui/icon";
import PageHeader from "@/components/ui/page-header";
import { requestErrorMessage } from "@/lib/api-client";
import { materialSubjectPath } from "@/lib/auth";
import { listUploadableSubjects, type UploadableSubject } from "@/lib/materials";

import styles from "./material-subjects.module.css";

type State =
  | { status: "loading" }
  | { status: "ready"; attempt: number; subjects: UploadableSubject[] }
  | { status: "error"; attempt: number; message: string };

const ROLE_LABELS: Record<string, string> = { MONITOR: "Monitor", TEACHER: "Docente" };

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The subjects a monitor or teacher may add material to, read again on `retry`. */
export function useUploadableSubjects() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    listUploadableSubjects(controller.signal).then(
      (subjects) => {
        if (!controller.signal.aborted) setState({ status: "ready", attempt, subjects });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ status: "error", attempt, message: requestErrorMessage(error) });
        }
      },
    );
    return () => controller.abort();
  }, [attempt]);

  const settled = state.status !== "loading" && state.attempt === attempt;
  return {
    state: settled ? state : ({ status: "loading" } as const),
    retry: () => setAttempt((value) => value + 1),
  };
}

/**
 * Step one of adding material (FASE-07): the monitor or teacher picks the subject first, so
 * there is never a doubt about where a file ends up. Each card says what it already holds.
 */
export default function MaterialSubjects() {
  const { state, retry } = useUploadableSubjects();

  return (
    <section className={styles.page} aria-labelledby="material-title">
      <PageHeader
        title="Material de apoyo"
        titleId="material-title"
        lead="Elige la asignatura a la que quieres subir documentos o videos."
      />

      {state.status === "loading" && (
        <>
          <p role="status" className="sr-only">
            Cargando tus asignaturas…
          </p>
          <div className={styles.grid} aria-hidden="true">
            <div className={styles.skeleton} />
            <div className={styles.skeleton} />
          </div>
        </>
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

      {state.status === "ready" && state.subjects.length === 0 && (
        <div className={styles.empty}>
          <EmptyState title="No tienes asignaturas para subir material en este período.">
            <p>
              Puedes subir material a las asignaturas en las que eres monitor asignado o docente de
              un curso. Si falta alguna, pide a la coordinación que te asigne.
            </p>
          </EmptyState>
        </div>
      )}

      {state.status === "ready" && state.subjects.length > 0 && (
        <ul className={styles.grid} aria-label="Asignaturas donde puedes subir material">
          {state.subjects.map((subject, index) => (
            <li key={subject.id} style={{ "--i": Math.min(index, 8) } as CSSProperties}>
              <Link
                href={materialSubjectPath(subject.id)}
                className={styles.card}
                aria-label={`Material de ${subject.name}`}
              >
                <span className={styles.top}>
                  <span className={styles.code}>{subject.code}</span>
                  <span className={styles.roles}>
                    {subject.roles.map((role) => (
                      <span key={role} className={styles.role} data-role={role}>
                        {ROLE_LABELS[role] ?? role}
                      </span>
                    ))}
                  </span>
                </span>
                <span className={styles.name}>{subject.name}</span>
                <span className={styles.department}>{subject.department}</span>
                <span className={styles.footer}>
                  <span className={styles.stat}>
                    <Icon name="file" size={15} />
                    {plural(subject.document_count, "documento", "documentos")}
                  </span>
                  <span className={styles.stat}>
                    <Icon name="video" size={15} />
                    {plural(subject.video_count, "video", "videos")}
                  </span>
                  <span className={styles.go}>
                    Abrir
                    <Icon name="chevron" size={16} className={styles.arrow} />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
