"use client";

import { useEffect, useState } from "react";

import Alert from "@/components/ui/alert";
import Avatar from "@/components/ui/avatar";
import Button from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import Icon from "@/components/ui/icon";
import PageHeader from "@/components/ui/page-header";
import { requestErrorMessage } from "@/lib/api-client";
import { isTermCode, listMyAssignments, type MonitorOwnAssignment } from "@/lib/catalog";
import { initialsOfFullName } from "@/lib/people";
import { useUrlQuery } from "@/lib/use-url-query";

import { countLabel, creditsLabel, hoursLabel } from "../labels";
import { useTerms } from "../use-catalog-reference";
import cards from "./my-courses.module.css";
import styles from "./my-monitoring.module.css";
import TermSelect from "./term-select";

type Request = { term: string | null; attempt: number };

type AssignmentsState =
  | { status: "loading" }
  | { status: "ready"; request: Request; assignments: MonitorOwnAssignment[] }
  | { status: "error"; request: Request; message: string };

function AssignmentCard({ assignment }: { assignment: MonitorOwnAssignment }) {
  const { subject, teachers } = assignment;
  const titleId = `assignment-${assignment.id}-title`;

  return (
    <article className={cards.card} aria-labelledby={titleId}>
      <header className={cards.cardHeader}>
        <p className={cards.meta}>
          <span className={cards.code}>{subject.code}</span>
          <span aria-hidden="true">·</span>
          <span>{creditsLabel(subject.credits)}</span>
        </p>
        <h2 id={titleId} className={cards.name}>
          {subject.name}
        </h2>
        <p className={cards.context}>
          <span className={cards.group} title="Horas comprometidas">
            {hoursLabel(assignment.committed_hours)}
          </span>
          <span>{subject.department.name}</span>
        </p>
      </header>

      {teachers.length === 0 ? (
        <p className={cards.noMonitors}>
          Aún no hay docentes asignados a los grupos de esta asignatura en el período.
        </p>
      ) : (
        <ul className={cards.monitors} aria-label={`Docentes de ${subject.name}`}>
          {teachers.map((teacher) => (
            <li key={`${teacher.id}-${teacher.group}`} className={cards.monitor}>
              <Avatar initials={initialsOfFullName(teacher.full_name, teacher.email)} size="sm" />
              <span className={cards.person}>
                <span className={cards.personName}>{teacher.full_name || teacher.email}</span>
                <a className={cards.email} href={`mailto:${teacher.email}`}>
                  {teacher.email}
                </a>
              </span>
              <span className={styles.groupLabel}>Grupo {teacher.group}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

/**
 * A monitor's own subjects in a term, the hours committed to each and the teachers of their
 * groups (RN-009.1): never the whole catalog. The term follows the current one unless the
 * person picks another.
 */
export default function MyMonitoring() {
  const url = useUrlQuery();
  const [request, setRequest] = useState<Request>(() => {
    const term = url.initial.get("periodo");
    return { term: term && isTermCode(term) ? term : null, attempt: 0 };
  });
  const [state, setState] = useState<AssignmentsState>({ status: "loading" });
  const { terms, current } = useTerms();

  useEffect(() => {
    const controller = new AbortController();
    listMyAssignments(request.term, controller.signal).then(
      (assignments) => {
        if (!controller.signal.aborted) setState({ status: "ready", request, assignments });
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
  const assignments = state.status === "ready" && settled ? state.assignments : null;
  const totalHours = assignments?.reduce((sum, item) => sum + item.committed_hours, 0) ?? 0;

  return (
    <section className={cards.page} aria-labelledby="my-monitoring-title">
      <PageHeader
        title="Mis monitorías"
        titleId="my-monitoring-title"
        lead="Las asignaturas que acompañas en el período, tus horas y sus docentes."
      >
        <TermSelect
          id="my-monitoring-term"
          value={request.term}
          terms={terms}
          current={current}
          onChange={changeTerm}
          className={cards.term}
        />
      </PageHeader>

      {state.status === "error" && settled && (
        <div className={cards.failure}>
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
            Cargando tus monitorías…
          </p>
          <div className={cards.grid} aria-hidden="true">
            <div className={cards.skeleton} />
            <div className={cards.skeleton} />
          </div>
        </>
      )}

      {assignments && assignments.length === 0 && (
        <div className={cards.empty}>
          <EmptyState title="No tienes monitorías asignadas en este período.">
            <p>
              {termLabel
                ? `Si acompañas una asignatura en ${termLabel}, pide a la coordinación que registre tu monitoría.`
                : "Cuando la coordinación te asigne una asignatura, aparecerá aquí."}
            </p>
          </EmptyState>
        </div>
      )}

      {assignments && assignments.length > 0 && (
        <>
          <p className={styles.summary}>
            <span className={styles.total}>{`${hoursLabel(totalHours)} comprometidas en el período`}</span>
            <span aria-hidden="true">·</span>
            <span>{countLabel(assignments.length, "asignatura", "asignaturas")}</span>
          </p>
          <div className={cards.grid}>
            {assignments.map((assignment) => (
              <AssignmentCard key={assignment.id} assignment={assignment} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
