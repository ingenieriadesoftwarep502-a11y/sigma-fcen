"use client";

import Link from "next/link";
import { type CSSProperties, useEffect, useRef, useState } from "react";

import Alert from "@/components/ui/alert";
import Avatar from "@/components/ui/avatar";
import Button, { ButtonLink } from "@/components/ui/button";
import Drawer from "@/components/ui/drawer";
import EmptyState from "@/components/ui/empty-state";
import Icon from "@/components/ui/icon";
import SearchField from "@/components/ui/search-field";
import MonitorSlots from "@/features/availability/components/monitor-slots";
import { availableSlotsLabel, nextSlotLabel } from "@/features/availability/labels";
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

/** Past this many monitors, the roster offers a search by name. */
const SEARCHABLE_FROM = 6;

function sortableName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Soonest help first: monitors with slots by their next one, then the rest by name. */
function bySoonest(a: SubjectMonitor, b: SubjectMonitor): number {
  if (a.next_slot_at && b.next_slot_at) return a.next_slot_at.localeCompare(b.next_slot_at);
  if (a.next_slot_at) return -1;
  if (b.next_slot_at) return 1;
  return 0;
}

type RosterProps = {
  subject: Subject;
  term: string | null;
};

/**
 * The monitors of the subject in the term, soonest available first, each with how many
 * slots it offers and when the next one is. Choosing one opens its slots in a side panel
 * (a sheet on phones), so the page stays short however many slots there are.
 */
function MonitorRoster({ subject, term }: RosterProps) {
  const { state, retry } = useSubjectData<SubjectMonitor[]>(subject.id, loadMonitors);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<SubjectMonitor | null>(null);
  const openers = useRef(new Map<string, HTMLButtonElement>());

  function close() {
    const id = open?.id;
    setOpen(null);
    if (id) openers.current.get(id)?.focus();
  }

  const monitors = state.status === "ready" ? [...state.data].sort(bySoonest) : [];
  const needle = sortableName(query.trim());
  const shown = needle
    ? monitors.filter((monitor) => sortableName(monitor.full_name).includes(needle))
    : monitors;
  const totalSlots = monitors.reduce((sum, monitor) => sum + monitor.upcoming_slots, 0);

  return (
    <section className={styles.roster} aria-labelledby="subject-monitors-title">
      <header className={styles.rosterHeader}>
        <div className={styles.rosterHeading}>
          <h2 id="subject-monitors-title" className={styles.sectionTitle}>
            {term ? `Monitores del período ${term}` : "Monitores del período"}
          </h2>
          {state.status === "ready" && monitors.length > 0 && (
            <p className={styles.summary}>
              {`${monitors.length} ${monitors.length === 1 ? "monitor" : "monitores"} · ${availableSlotsLabel(totalSlots)}`}
            </p>
          )}
        </div>
        {monitors.length > SEARCHABLE_FROM && (
          <SearchField
            id="monitor-search"
            label="Buscar monitor"
            placeholder="Buscar monitor por nombre"
            value={query}
            onChange={setQuery}
            onClear={() => setQuery("")}
            className={styles.search}
          />
        )}
      </header>

      {state.status === "loading" && (
        <>
          <p role="status" className="sr-only">
            Cargando monitores…
          </p>
          <div className={styles.grid} aria-hidden="true">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className={styles.tileSkeleton} />
            ))}
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
      {state.status === "ready" && monitors.length === 0 && (
        <div className={styles.empty}>
          <EmptyState title="Esta asignatura no tiene monitores en el período.">
            <p>Cuando se asigne un monitor, podrás ver aquí sus franjas.</p>
          </EmptyState>
        </div>
      )}
      {state.status === "ready" && monitors.length > 0 && shown.length === 0 && (
        <p className={styles.muted}>{`Ningún monitor coincide con «${query.trim()}».`}</p>
      )}
      {shown.length > 0 && (
        <ul className={styles.grid} aria-label={`Monitores de ${subject.name}`}>
          {shown.map((monitor, index) => {
            const name = monitor.full_name || "Monitor sin nombre";
            const free = monitor.upcoming_slots > 0;
            return (
              <li key={monitor.id} style={{ "--i": Math.min(index, 8) } as CSSProperties}>
                <button
                  type="button"
                  ref={(element) => {
                    if (element) openers.current.set(monitor.id, element);
                    else openers.current.delete(monitor.id);
                  }}
                  className={styles.tile}
                  data-free={free || undefined}
                  data-open={open?.id === monitor.id || undefined}
                  aria-haspopup="dialog"
                  aria-label={`Ver las franjas de ${name}`}
                  onClick={() => setOpen(monitor)}
                >
                  <span className={styles.face}>
                    <Avatar initials={initialsOfFullName(monitor.full_name, "?")} />
                  </span>
                  <span className={styles.who}>
                    <span className={styles.name}>{name}</span>
                    <span className={styles.next}>
                      {monitor.next_slot_at ? (
                        <>
                          <Icon name="clock" size={14} />
                          {`Próxima: ${nextSlotLabel(monitor.next_slot_at)}`}
                        </>
                      ) : (
                        "Sin franjas por ahora"
                      )}
                    </span>
                  </span>
                  <span className={styles.count} aria-hidden={!free || undefined}>
                    <span className={styles.countValue}>{free ? monitor.upcoming_slots : "—"}</span>
                    <span className={styles.countLabel}>
                      {monitor.upcoming_slots === 1 ? "franja" : "franjas"}
                    </span>
                  </span>
                  <Icon name="chevron" size={18} className={styles.arrow} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <Drawer
          title={open.full_name || "Monitor sin nombre"}
          subtitle={`${subject.code} · ${subject.name}`}
          sheet
          onClose={close}
        >
          <MonitorSlots
            key={open.id}
            subject={{ id: subject.id, code: subject.code, name: subject.name }}
            monitor={{
              id: open.id,
              name: open.full_name || "Monitor sin nombre",
            }}
            term={term}
          />
        </Drawer>
      )}
    </section>
  );
}

/**
 * One subject as a student sees it: what it is and its monitors of the current term, each
 * opening its upcoming slots on demand (they took the place of the old standalone search).
 * Read-only: booking arrives in FASE-04. Container: owns the subject and the current term.
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
  // The roster waits for the current term, so its slots never show another term's first.
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

          {termKnown && <MonitorRoster key={term ?? "all"} subject={state.data} term={term} />}
        </>
      )}
    </article>
  );
}
