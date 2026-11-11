"use client";

import { useEffect, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import Icon from "@/components/ui/icon";
import PageHeader from "@/components/ui/page-header";
import SelectField from "@/components/ui/select-field";
import TermSelect from "@/features/catalog/components/term-select";
import { useTerms } from "@/features/catalog/use-catalog-reference";
import { requestErrorMessage } from "@/lib/api-client";
import { isTermCode } from "@/lib/catalog";
import { listTeachingCourses, type TeachingCourse } from "@/lib/teaching";
import { useUrlQuery } from "@/lib/use-url-query";

import { courseLabel } from "../labels";
import CourseOverview from "./course-overview";
import CourseSessions from "./course-sessions";
import styles from "./teaching.module.css";

type Request = { term: string | null; attempt: number };

type CoursesState =
  | { status: "loading" }
  | { status: "ready"; request: Request; courses: TeachingCourse[] }
  | { status: "error"; request: Request; message: string };

const numberFormat = new Intl.NumberFormat("es-CO");

function parseCourse(value: string | null): number | null {
  const id = Number(value);
  return value && Number.isInteger(id) && id > 0 ? id : null;
}

/** The selected course's headline figures. Presentational. */
function CourseFigures({ course }: { course: TeachingCourse }) {
  const figures = [
    { label: "Sesiones realizadas", value: course.session_count },
    { label: "Estudiantes atendidos", value: course.student_count },
    { label: "Monitores asignados", value: course.monitor_count },
  ];
  return (
    <section className={styles.band} aria-label="Indicadores del curso">
      <dl className={styles.figures}>
        {figures.map((figure) => (
          <div key={figure.label} className={styles.figure}>
            <dt className={styles.figureLabel}>{figure.label}</dt>
            <dd className={styles.figureValue}>{numberFormat.format(figure.value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * The teacher's follow-up panel (T-08.11, HU-09): pick a term and one of your courses, then
 * read its indicators, frequent topics, monitors, students and sessions. Everything is
 * read-only and filtered by the server to the teacher's own courses (RN-009.1).
 * Container: owns the term, the course and their place in the URL.
 */
export default function TeachingPanel() {
  const url = useUrlQuery();
  const [request, setRequest] = useState<Request>(() => {
    const term = url.initial.get("periodo");
    return { term: term && isTermCode(term) ? term : null, attempt: 0 };
  });
  const [courseId, setCourseId] = useState<number | null>(() =>
    parseCourse(url.initial.get("curso")),
  );
  const [state, setState] = useState<CoursesState>({ status: "loading" });
  const { terms, current } = useTerms();

  useEffect(() => {
    const controller = new AbortController();
    listTeachingCourses(request.term, controller.signal).then(
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

  function writeUrl(term: string | null, course: number | null) {
    const params = new URLSearchParams();
    if (term) params.set("periodo", term);
    if (course !== null) params.set("curso", String(course));
    url.replace(params);
  }

  function changeTerm(term: string | null) {
    setRequest((currentRequest) => ({ term, attempt: currentRequest.attempt + 1 }));
    setCourseId(null);
    writeUrl(term, null);
  }

  function changeCourse(value: string) {
    const id = parseCourse(value);
    setCourseId(id);
    writeUrl(request.term, id);
  }

  const settled = state.status !== "loading" && state.request === request;
  const courses = state.status === "ready" && settled ? state.courses : null;
  const selected = courses
    ? (courses.find((course) => course.id === courseId) ?? courses[0] ?? null)
    : null;
  const termLabel = request.term ?? current?.code ?? null;

  return (
    <section className={styles.page} aria-labelledby="teaching-title">
      <PageHeader
        title="Seguimiento"
        titleId="teaching-title"
        lead="Sesiones, estudiantes atendidos y temas más frecuentes de tus cursos."
      >
        <TermSelect
          id="teaching-term"
          value={request.term}
          terms={terms}
          current={current}
          onChange={changeTerm}
          className={styles.term}
        />
        {courses && courses.length > 0 && selected && (
          <SelectField
            id="teaching-course"
            label="Curso"
            value={String(selected.id)}
            onChange={changeCourse}
            className={styles.course}
          >
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {courseLabel(course)}
              </option>
            ))}
          </SelectField>
        )}
      </PageHeader>

      {state.status === "error" && settled && (
        <div className={styles.failure}>
          <Alert tone="error">{state.message}</Alert>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setRequest((currentRequest) => ({
                ...currentRequest,
                attempt: currentRequest.attempt + 1,
              }))
            }
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
          <div className={styles.skeletonBand} aria-hidden="true" />
        </>
      )}

      {courses && courses.length === 0 && (
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

      {selected && (
        <>
          <CourseFigures course={selected} />
          <CourseOverview key={`overview-${selected.id}`} courseId={selected.id} />
          <CourseSessions key={`sessions-${selected.id}`} courseId={selected.id} />
        </>
      )}
    </section>
  );
}
