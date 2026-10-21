"use client";

import { useEffect, useState } from "react";

import Alert from "@/components/ui/alert";
import Avatar from "@/components/ui/avatar";
import Button from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import Icon from "@/components/ui/icon";
import PageHeader from "@/components/ui/page-header";
import { requestErrorMessage } from "@/lib/api-client";
import { isTermCode, listMyCourses, type TeacherCourse } from "@/lib/catalog";
import { initialsOfFullName } from "@/lib/people";
import { useUrlQuery } from "@/lib/use-url-query";

import { creditsLabel, hoursLabel } from "../labels";
import { useTerms } from "../use-catalog-reference";
import styles from "./my-courses.module.css";
import TermSelect from "./term-select";

type Request = { term: string | null; attempt: number };

type CoursesState =
  | { status: "loading" }
  | { status: "ready"; request: Request; courses: TeacherCourse[] }
  | { status: "error"; request: Request; message: string };

function CourseCard({ course }: { course: TeacherCourse }) {
  const titleId = `course-${course.id}-title`;
  const total = course.monitors.reduce((sum, monitor) => sum + monitor.committed_hours, 0);

  return (
    <article className={styles.card} aria-labelledby={titleId}>
      <header className={styles.cardHeader}>
        <p className={styles.meta}>
          <span className={styles.code}>{course.subject.code}</span>
          <span aria-hidden="true">·</span>
          <span>{creditsLabel(course.subject.credits)}</span>
        </p>
        <h2 id={titleId} className={styles.name}>
          {course.subject.name}
        </h2>
        <p className={styles.context}>
          <span className={styles.group}>Grupo {course.group}</span>
          <span>{course.subject.department.name}</span>
        </p>
      </header>

      {course.monitors.length === 0 ? (
        <p className={styles.noMonitors}>
          Aún no hay monitores asignados. La coordinación del catálogo los autoriza por
          asignatura y período.
        </p>
      ) : (
        <>
          <ul className={styles.monitors} aria-label={`Monitores de ${course.subject.name}`}>
            {course.monitors.map((monitor) => (
              <li key={monitor.id} className={styles.monitor}>
                <Avatar initials={initialsOfFullName(monitor.full_name, monitor.email)} size="sm" />
                <span className={styles.person}>
                  <span className={styles.personName}>{monitor.full_name || monitor.email}</span>
                  <a className={styles.email} href={`mailto:${monitor.email}`}>
                    {monitor.email}
                  </a>
                </span>
                <span className={styles.hours} title="Horas comprometidas">
                  {hoursLabel(monitor.committed_hours)}
                </span>
              </li>
            ))}
          </ul>
          <p className={styles.total}>{`${hoursLabel(total)} comprometidas en total`}</p>
        </>
      )}
    </article>
  );
}

/**
 * A teacher's own courses in a term and the monitors who support each one (T-02.8,
 * RN-009.1). The term follows the current one unless the person picks another.
 */
export default function MyCourses() {
  const url = useUrlQuery();
  const [request, setRequest] = useState<Request>(() => {
    const term = url.initial.get("periodo");
    return { term: term && isTermCode(term) ? term : null, attempt: 0 };
  });
  const [state, setState] = useState<CoursesState>({ status: "loading" });
  const { terms, current } = useTerms();

  useEffect(() => {
    const controller = new AbortController();
    listMyCourses(request.term, controller.signal).then(
      (courses) => {
        if (!controller.signal.aborted) setState({ status: "ready", request, courses });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ status: "error", request, message: requestErrorMessage(error) });
        }
      },
    );
    return () => controller.abort();
  }, [request]);

  function changeTerm(term: string | null) {
    setRequest((current) => ({ term, attempt: current.attempt + 1 }));
    const params = new URLSearchParams();
    if (term) params.set("periodo", term);
    url.replace(params);
  }

  const settled = state.status !== "loading" && state.request === request;
  const termLabel = request.term ?? current?.code ?? null;

  return (
    <section className={styles.page} aria-labelledby="my-courses-title">
      <PageHeader
        title="Mis cursos"
        titleId="my-courses-title"
        lead="Tus grupos del período y los monitores que acompañan cada uno."
      >
        <TermSelect
          id="my-courses-term"
          value={request.term}
          terms={terms}
          current={current}
          onChange={changeTerm}
          className={styles.term}
        />
      </PageHeader>

      {state.status === "error" && settled && (
        <div className={styles.failure}>
          <Alert tone="error">{state.message}</Alert>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRequest((current) => ({ ...current, attempt: current.attempt + 1 }))}
          >
            <Icon name="refresh" />
            Intentar de nuevo
          </Button>
        </div>
      )}

      {!settled && (
        <>
          <p role="status" className="sr-only">
            Cargando tus cursos…
          </p>
          <div className={styles.grid} aria-hidden="true">
            <div className={styles.skeleton} />
            <div className={styles.skeleton} />
          </div>
        </>
      )}

      {state.status === "ready" && settled && state.courses.length === 0 && (
        <div className={styles.empty}>
          <EmptyState title="No tienes cursos en este período.">
            <p>
              {termLabel
                ? `Si dictas un grupo en ${termLabel}, pide a la coordinación que te asigne como docente.`
                : "Cuando la coordinación te asigne un grupo, aparecerá aquí."}
            </p>
          </EmptyState>
        </div>
      )}

      {state.status === "ready" && settled && state.courses.length > 0 && (
        <div className={styles.grid}>
          {state.courses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      )}
    </section>
  );
}
