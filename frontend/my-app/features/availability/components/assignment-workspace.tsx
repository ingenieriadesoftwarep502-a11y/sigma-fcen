"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import Alert from "@/components/ui/alert";
import Avatar from "@/components/ui/avatar";
import Button, { ButtonLink } from "@/components/ui/button";
import Drawer from "@/components/ui/drawer";
import EmptyState from "@/components/ui/empty-state";
import Icon from "@/components/ui/icon";
import { requestErrorMessage } from "@/lib/api-client";
import { MY_MONITORING_PATH } from "@/lib/auth";
import { listMySlotsBetween, type Slot } from "@/lib/availability";
import { isTermCode, listMyAssignments, type MonitorOwnAssignment } from "@/lib/catalog";
import { initialsOfFullName } from "@/lib/people";
import { useDrawerState } from "@/lib/use-drawer-state";

import { creditsLabel, hoursLabel } from "../../catalog/labels";
import { availableSlotsLabel, nextSlotLabel } from "../labels";
import {
  addDays,
  minutesNowInBogota,
  mondayOf,
  todayInBogota,
  weekDates,
  weekRangeLabel,
} from "../week";
import styles from "./assignment-workspace.module.css";
import SlotAgenda from "./slot-agenda";
import SlotForm from "./slot-form";
import SlotSheet, { describeSlot } from "./slot-sheet";
import TemplateForm from "./template-form";
import TemplateList from "./template-list";
import WeekCalendar from "./week-calendar";

type View = "semana" | "lista";

type Panel =
  | { kind: "create"; initial?: { date: string; time: string } }
  | { kind: "slot"; slot: Slot }
  | { kind: "template" };

type Loaded<T> =
  | { status: "loading" }
  | { status: "ready"; key: string; data: T; stale?: true }
  | { status: "error"; key: string; message: string };

/**
 * Reads `load` again whenever `key` changes. While a new read is on its way, the last data
 * stays on screen, so a refresh never blanks the view nor loses what the person was doing.
 */
function useKeyed<T>(key: string, load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<Loaded<T>>({ status: "loading" });
  const run = useEffectEvent(load);

  useEffect(() => {
    const controller = new AbortController();
    run(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: "ready", key, data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ status: "error", key, message: requestErrorMessage(error) });
        }
      },
    );
    return () => controller.abort();
  }, [key]);

  if (state.status !== "loading" && state.key === key) return state;
  return state.status === "ready"
    ? { ...state, stale: true as const }
    : ({ status: "loading" } as const);
}

/**
 * Where a monitor organizes one assignment's availability (T-03.16, HU-05): its week on an
 * hour grid, where a free hour becomes a new slot in one click and a slot opens to be edited
 * or withdrawn; the same slots as a filtered list; and its weekly templates. Every list and
 * form is scoped to the assignment's subject and term (RN-003.5).
 * Container: owns the week in view, the drawers and the notices.
 */
export default function AssignmentWorkspace({ assignmentId }: { assignmentId: number }) {
  const params = useSearchParams();
  const termParam = params.get("periodo");
  const term = termParam && isTermCode(termParam) ? termParam : null;
  const [version, setVersion] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const assignments = useKeyed(`${term}|${version}|${attempt}`, (signal) =>
    listMyAssignments(term, signal),
  );

  if (assignments.status === "loading") {
    return (
      <div className={styles.page}>
        <p role="status" className="sr-only">
          Cargando la monitoría…
        </p>
        <div className={styles.headerSkeleton} aria-hidden="true" />
        <div className={styles.gridSkeleton} aria-hidden="true" />
      </div>
    );
  }

  if (assignments.status === "error") {
    return (
      <div className={styles.page}>
        <BackLink />
        <div className={styles.failure}>
          <Alert tone="error">{assignments.message}</Alert>
          <Button variant="ghost" size="sm" onClick={() => setAttempt((value) => value + 1)}>
            <Icon name="refresh" />
            Intentar de nuevo
          </Button>
        </div>
      </div>
    );
  }

  const assignment = assignments.data.find((item) => item.id === assignmentId);
  if (!assignment) {
    return (
      <div className={styles.page}>
        <BackLink />
        <div className={styles.missing}>
          <EmptyState
            title="No encontramos esta monitoría."
            action={
              <ButtonLink href={MY_MONITORING_PATH} variant="ghost" size="sm">
                Volver a Mis monitorías
              </ButtonLink>
            }
          >
            <p>Puede ser de otro período o ya no estar asignada a tu cuenta.</p>
          </EmptyState>
        </div>
      </div>
    );
  }

  return (
    <Workspace
      assignment={assignment}
      version={version}
      onChanged={() => setVersion((value) => value + 1)}
    />
  );
}

function BackLink() {
  return (
    <Link href={MY_MONITORING_PATH} className={styles.back}>
      <Icon name="chevron" className={styles.backIcon} />
      Mis monitorías
    </Link>
  );
}

type WorkspaceProps = {
  assignment: MonitorOwnAssignment;
  version: number;
  /** The availability changed: every view reads it again. */
  onChanged: () => void;
};

function Workspace({ assignment, version, onChanged }: WorkspaceProps) {
  const { subject, term, teachers } = assignment;
  const [now, setNow] = useState(() => new Date());
  const today = todayInBogota(now);
  const [monday, setMonday] = useState(() => mondayOf(today));
  const [view, setView] = useState<View>("semana");
  const [notice, setNotice] = useState<string | null>(null);
  const publishButton = useRef<HTMLButtonElement>(null);
  const drawer = useDrawerState<Panel>(publishButton);
  const days = weekDates(monday);

  // The "now" line and the past hours move with the clock.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const week = useKeyed(`${term}|${monday}|${version}`, (signal) =>
    listMySlotsBetween(term, monday, addDays(monday, 6), signal),
  );

  function changed(message: string) {
    setNotice(message);
    drawer.close();
    onChanged();
  }

  function openCreate(
    event: { currentTarget: HTMLElement },
    initial?: { date: string; time: string },
  ) {
    setNotice(null);
    drawer.open({ kind: "create", initial }, event);
  }

  const panel = drawer.panel;
  const weekSlots = week.status === "ready" ? week.data : [];
  const ownThisWeek = weekSlots.filter(
    (slot) => slot.subject.id === subject.id && slot.status !== "CANCELLED",
  ).length;

  return (
    <article className={styles.page} aria-labelledby="workspace-title">
      <BackLink />

      <header className={styles.header}>
        <div className={styles.heading}>
          <p className={styles.meta}>
            <span className={styles.code}>{subject.code}</span>
            <span aria-hidden="true">·</span>
            <span>{creditsLabel(subject.credits)}</span>
            <span aria-hidden="true">·</span>
            <span>{`Período ${term}`}</span>
          </p>
          <h1 id="workspace-title" className={styles.title}>
            {subject.name}
          </h1>
          <p className={styles.summary}>
            <span
              className={styles.hours}
            >{`${hoursLabel(assignment.committed_hours)} comprometidas`}</span>
            <span>{availableSlotsLabel(assignment.upcoming_slots)}</span>
            {assignment.next_slot_at && (
              <span>{`Próxima: ${nextSlotLabel(assignment.next_slot_at, now)}`}</span>
            )}
            <span>
              {`${assignment.active_templates} ${assignment.active_templates === 1 ? "plantilla activa" : "plantillas activas"}`}
            </span>
          </p>
        </div>
        <div className={styles.actions}>
          <Button ref={publishButton} onClick={(event) => openCreate(event)} aria-haspopup="dialog">
            <Icon name="plus" />
            Publicar franja
          </Button>
          <Button
            variant="ghost"
            aria-haspopup="dialog"
            onClick={(event) => {
              setNotice(null);
              drawer.open({ kind: "template" }, event);
            }}
          >
            <Icon name="repeat" />
            Nueva plantilla
          </Button>
        </div>
      </header>

      {notice && (
        <div className={styles.notice}>
          <Alert tone="success">{notice}</Alert>
        </div>
      )}

      <div className={styles.layout}>
        <section className={styles.main} aria-labelledby="availability-title">
          <h2 id="availability-title" className="sr-only">
            Tu disponibilidad
          </h2>
          <div className={styles.toolbar}>
            {view === "semana" ? (
              <div className={styles.weekNav}>
                <div className={styles.stepper}>
                  <button
                    type="button"
                    className={styles.step}
                    aria-label="Semana anterior"
                    onClick={() => setMonday(addDays(monday, -7))}
                  >
                    <Icon name="chevron" size={18} className={styles.prev} />
                  </button>
                  <button
                    type="button"
                    className={styles.step}
                    aria-label="Semana siguiente"
                    onClick={() => setMonday(addDays(monday, 7))}
                  >
                    <Icon name="chevron" size={18} className={styles.next} />
                  </button>
                </div>
                <p className={styles.range} aria-live="polite">
                  {weekRangeLabel(monday)}
                </p>
                {monday !== mondayOf(today) && (
                  <Button variant="ghost" size="sm" onClick={() => setMonday(mondayOf(today))}>
                    Hoy
                  </Button>
                )}
              </div>
            ) : (
              <p className={styles.range}>Todas tus franjas de la asignatura</p>
            )}

            <div className={styles.segmented} role="group" aria-label="Vista">
              {(["semana", "lista"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={styles.segment}
                  aria-pressed={view === option}
                  onClick={() => setView(option)}
                >
                  <Icon name={option === "semana" ? "calendar" : "menu"} size={16} />
                  {option === "semana" ? "Semana" : "Lista"}
                </button>
              ))}
            </div>
          </div>

          {view === "semana" ? (
            <>
              {week.status === "error" && (
                <div className={styles.failure}>
                  <Alert tone="error">{week.message}</Alert>
                </div>
              )}
              <div className={styles.legend} aria-hidden="true">
                <span className={styles.key} data-kind="available">
                  Disponible
                </span>
                <span className={styles.key} data-kind="reserved">
                  Sin cupos
                </span>
                <span className={styles.key} data-kind="other">
                  Otra asignatura
                </span>
                <span className={styles.hint}>
                  {ownThisWeek === 0
                    ? "Haz clic en una hora libre para publicar una franja."
                    : "Clic en una hora libre para publicar; en una franja para editarla."}
                </span>
              </div>
              <WeekCalendar
                days={days}
                slots={weekSlots}
                subjectId={subject.id}
                today={today}
                nowMinutes={minutesNowInBogota(now)}
                loading={
                  week.status === "loading" || (week.status === "ready" && week.stale === true)
                }
                onCreate={(date, time) =>
                  openCreate(
                    { currentTarget: publishButton.current as HTMLElement },
                    { date, time },
                  )
                }
                onOpen={(slot, opener) => {
                  setNotice(null);
                  drawer.open({ kind: "slot", slot }, { currentTarget: opener });
                }}
              />
            </>
          ) : (
            <SlotAgenda
              term={term}
              subjectId={subject.id}
              today={today}
              version={version}
              onOpen={(slot, opener) => {
                setNotice(null);
                drawer.open({ kind: "slot", slot }, { currentTarget: opener });
              }}
            />
          )}
        </section>

        <aside className={styles.aside}>
          <TemplateList
            assignment={assignment}
            version={version}
            onCreate={(event) => {
              setNotice(null);
              drawer.open({ kind: "template" }, event);
            }}
            onChanged={(message) => {
              setNotice(message);
              onChanged();
            }}
          />

          <section className={styles.teachers} aria-labelledby="teachers-title">
            <h2 id="teachers-title" className={styles.asideTitle}>
              Docentes
            </h2>
            {teachers.length === 0 ? (
              <p className={styles.asideEmpty}>
                Aún no hay docentes asignados a los grupos de esta asignatura en el período.
              </p>
            ) : (
              <ul className={styles.people}>
                {teachers.map((teacher) => (
                  <li key={`${teacher.id}-${teacher.group}`} className={styles.person}>
                    <Avatar
                      initials={initialsOfFullName(teacher.full_name, teacher.email)}
                      size="sm"
                    />
                    <span className={styles.personText}>
                      <span className={styles.personName}>
                        {teacher.full_name || teacher.email}
                      </span>
                      <a className={styles.email} href={`mailto:${teacher.email}`}>
                        {teacher.email}
                      </a>
                    </span>
                    <span className={styles.group}>{`G${teacher.group}`}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {panel?.kind === "create" && (
        <Drawer
          title="Publicar franja"
          subtitle={`${subject.code} · ${subject.name}`}
          locked={drawer.busy}
          sheet
          onClose={drawer.close}
        >
          <SlotForm
            assignment={assignment}
            initial={panel.initial}
            onSaved={changed}
            onBusyChange={drawer.setBusy}
          />
        </Drawer>
      )}
      {panel?.kind === "slot" && (
        <Drawer
          title="Franja"
          subtitle={`${subject.code} · ${describeSlot(panel.slot)}`}
          locked={drawer.busy}
          sheet
          onClose={drawer.close}
        >
          <SlotSheet
            slot={panel.slot}
            assignment={assignment}
            onChanged={changed}
            onBusyChange={drawer.setBusy}
          />
        </Drawer>
      )}
      {panel?.kind === "template" && (
        <Drawer
          title="Nueva plantilla semanal"
          subtitle={`${subject.code} · ${subject.name}`}
          locked={drawer.busy}
          sheet
          onClose={drawer.close}
        >
          <TemplateForm assignment={assignment} onSaved={changed} onBusyChange={drawer.setBusy} />
        </Drawer>
      )}
    </article>
  );
}
