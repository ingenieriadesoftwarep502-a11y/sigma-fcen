"use client";

import Link from "next/link";
import { type CSSProperties, useEffect, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import Icon from "@/components/ui/icon";
import PageHeader from "@/components/ui/page-header";
import { nextSlotLabel } from "@/features/availability/labels";
import { requestErrorMessage } from "@/lib/api-client";
import { myAssignmentPath } from "@/lib/auth";
import { isTermCode, listMyAssignments, type MonitorOwnAssignment } from "@/lib/catalog";
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

/**
 * One assignment as a card that opens its availability workspace: the subject, the hours
 * committed, how much availability it has published and who teaches its groups. The whole
 * card is the link; its title names it.
 */
function AssignmentCard({
  assignment,
  index,
}: {
  assignment: MonitorOwnAssignment;
  index: number;
}) {
  const { subject, teachers } = assignment;
  const titleId = `assignment-${assignment.id}-title`;
  const free = assignment.upcoming_slots > 0;

  return (
    <article
      className={styles.card}
      aria-labelledby={titleId}
      data-free={free || undefined}
      style={{ "--i": Math.min(index, 8) } as CSSProperties}
    >
      <header className={styles.cardHeader}>
        <p className={styles.meta}>
          <span className={styles.code}>{subject.code}</span>
          <span aria-hidden="true">·</span>
          <span>{creditsLabel(subject.credits)}</span>
          <span className={styles.hours} title="Horas comprometidas">
            {hoursLabel(assignment.committed_hours)}
          </span>
        </p>
        <h2 id={titleId} className={styles.name}>
          <Link
            href={myAssignmentPath(assignment.id, assignment.term)}
            className={styles.link}
            aria-describedby={`${titleId}-cta`}
          >
            {subject.name}
          </Link>
        </h2>
        <p className={styles.department}>{subject.department.name}</p>
      </header>

      <div className={styles.availability}>
        <p className={styles.count}>
          <span className={styles.countValue}>{assignment.upcoming_slots}</span>
          <span className={styles.countLabel}>
            {assignment.upcoming_slots === 1 ? "franja disponible" : "franjas disponibles"}
          </span>
        </p>
        <ul className={styles.facts}>
          <li>
            <Icon name="clock" size={14} />
            {assignment.next_slot_at
              ? `Próxima: ${nextSlotLabel(assignment.next_slot_at)}`
              : "Sin franjas próximas"}
          </li>
          <li>
            <Icon name="repeat" size={14} />
            {assignment.active_templates === 0
              ? "Sin plantillas semanales"
              : `${assignment.active_templates} ${assignment.active_templates === 1 ? "plantilla activa" : "plantillas activas"}`}
          </li>
        </ul>
      </div>

      <footer className={styles.footer}>
        <p className={styles.teachers}>
          {teachers.length === 0
            ? "Sin docentes asignados en el período"
            : teachers
                .map((teacher) => `${teacher.full_name || teacher.email} · G${teacher.group}`)
                .join(", ")}
        </p>
        <span id={`${titleId}-cta`} className={styles.cta}>
          {free ? "Organizar disponibilidad" : "Publicar disponibilidad"}
          <Icon name="chevron" size={16} className={styles.ctaIcon} />
        </span>
      </footer>
    </article>
  );
}

/**
 * A monitor's own subjects in a term, the hours committed to each and the teachers of their
 * groups (RN-009.1): never the whole catalog. Each card summarizes the assignment's
 * availability and opens its workspace, scoped to its subject and term (T-03.16). The term follows the current one unless the
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
        lead="Elige una asignatura para organizar tu disponibilidad: franjas, plantillas semanales y horario."
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
            <span
              className={styles.total}
            >{`${hoursLabel(totalHours)} comprometidas en el período`}</span>
            <span aria-hidden="true">·</span>
            <span>{countLabel(assignments.length, "asignatura", "asignaturas")}</span>
          </p>
          <div className={cards.grid}>
            {assignments.map((assignment, index) => (
              <AssignmentCard key={assignment.id} assignment={assignment} index={index} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
