"use client";

import { useEffect, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { requestErrorMessage } from "@/lib/api-client";
import {
  type FrequentTopic,
  listCourseMonitors,
  listCourseStudents,
  listFrequentTopics,
  type TeachingMonitor,
  type TeachingStudent,
} from "@/lib/teaching";

import { sessionCountLabel } from "../labels";
import styles from "./teaching.module.css";

type Overview = {
  topics: FrequentTopic[];
  monitors: TeachingMonitor[];
  students: TeachingStudent[];
};

type OverviewState =
  | { status: "loading"; attempt: number }
  | { status: "ready"; attempt: number; data: Overview }
  | { status: "error"; attempt: number; message: string };

/**
 * The frequent topics (RF-083), monitors (RF-080) and students who attended (RF-082) of
 * one course. Container: the server filters every list by `courseId`; remount it per course.
 */
export default function CourseOverview({ courseId }: { courseId: number }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<OverviewState>({ status: "loading", attempt: 0 });

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([
      listFrequentTopics(courseId, signal),
      listCourseMonitors(courseId, signal),
      listCourseStudents(courseId, signal),
    ]).then(
      ([topics, monitors, students]) => {
        if (!signal.aborted) {
          setState({
            status: "ready",
            attempt,
            data: { topics, monitors, students: students.results },
          });
        }
      },
      (error: unknown) => {
        if (!signal.aborted) {
          setState({ status: "error", attempt, message: requestErrorMessage(error) });
        }
      },
    );
    return () => controller.abort();
  }, [courseId, attempt]);

  const settled = state.attempt === attempt && state.status !== "loading";

  if (state.status === "error" && settled) {
    return (
      <div className={styles.failure}>
        <Alert tone="error">{state.message}</Alert>
        <Button variant="ghost" size="sm" onClick={() => setAttempt((current) => current + 1)}>
          <Icon name="refresh" />
          Intentar de nuevo
        </Button>
      </div>
    );
  }

  if (state.status !== "ready" || !settled) {
    return (
      <>
        <p role="status" className="sr-only">
          Cargando el seguimiento del curso…
        </p>
        <div className={styles.columns} aria-hidden="true">
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
        </div>
      </>
    );
  }

  const { topics, monitors, students } = state.data;

  return (
    <div className={styles.columns}>
      <section className={styles.panel} aria-labelledby="topics-title">
        <h2 id="topics-title" className={styles.sectionTitle}>
          Dificultades frecuentes
        </h2>
        <p className={styles.hint}>Los temas más trabajados en las sesiones del curso.</p>
        {topics.length === 0 ? (
          <p className={styles.none}>Aún no hay temas registrados en las sesiones de este curso.</p>
        ) : (
          <ol className={styles.ranking} aria-label="Dificultades frecuentes">
            {topics.map((topic) => (
              <li key={topic.id} className={styles.row}>
                <span className={styles.rowName}>{topic.name}</span>
                <span className={styles.rowFigure}>{sessionCountLabel(topic.session_count)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="monitors-title">
        <h2 id="monitors-title" className={styles.sectionTitle}>
          Monitores
        </h2>
        {monitors.length === 0 ? (
          <p className={styles.none}>Aún no hay monitores asignados a este curso.</p>
        ) : (
          <ul className={styles.rows} aria-label="Monitores del curso">
            {monitors.map((monitor) => (
              <li key={`${monitor.id}-${monitor.subject.id}`} className={styles.row}>
                <span className={styles.person}>
                  <span className={styles.rowName}>{monitor.full_name || monitor.email}</span>
                  <a className={styles.email} href={`mailto:${monitor.email}`}>
                    {monitor.email}
                  </a>
                </span>
                <span className={styles.rowFigure} title="Sesiones registradas">
                  {sessionCountLabel(monitor.session_count)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="students-title">
        <h2 id="students-title" className={styles.sectionTitle}>
          Estudiantes atendidos
        </h2>
        {students.length === 0 ? (
          <p className={styles.none}>Ningún estudiante ha asistido todavía.</p>
        ) : (
          <ul className={styles.rows} aria-label="Estudiantes atendidos">
            {/* Only names reach the browser (RNF-SEC-004), so the position is the key. */}
            {students.map((student, index) => (
              <li key={index} className={styles.row}>
                <span className={styles.rowName}>{student.full_name || "Sin nombre"}</span>
                <span className={styles.rowFigure} title="Sesiones a las que asistió">
                  {sessionCountLabel(student.session_count)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
