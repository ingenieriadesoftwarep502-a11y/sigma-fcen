"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import Drawer from "@/components/ui/drawer";
import EmptyState from "@/components/ui/empty-state";
import Icon from "@/components/ui/icon";
import PageHeader from "@/components/ui/page-header";
import { slotDayLabel, slotTimeRange } from "@/features/availability/labels";
import { requestErrorMessage } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import {
  EDIT_WINDOW_HOURS,
  isEditable,
  listMySessions,
  listPendingSlots,
  type MySessionFilters,
  type PendingSlot,
  type SessionSlot,
  type TutoringSession,
} from "@/lib/sessions";
import { useDrawerState } from "@/lib/use-drawer-state";
import { usePagedList } from "@/lib/use-paged-list";

import { attendanceSummary, durationLabel } from "../labels";
import SessionForm, { type SessionFormMode } from "./session-form";
import styles from "./sessions.module.css";

function sameFilters(a: MySessionFilters, b: MySessionFilters): boolean {
  return a.subject === b.subject;
}

function slotLabel(slot: SessionSlot): string {
  return `${slot.subject.name}, ${slotDayLabel(slot.starts_at)} ${slotTimeRange(slot.starts_at, slot.ends_at)}`;
}

/** The monitor's started slots still to record, reloaded after each save. */
function usePendingSlots() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ data: PendingSlot[] | null; error: string | null }>({
    data: null,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    listPendingSlots(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ data, error: null });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState((current) => ({ ...current, error: requestErrorMessage(error) }));
        }
      },
    );
    return () => controller.abort();
  }, [attempt]);

  const reload = useCallback(() => setAttempt((current) => current + 1), []);
  return { ...state, reload };
}

/**
 * The monitor's sessions (T-05.16, HU-06): the started slots whose session is still to be
 * recorded, and the ones already recorded, which can be corrected for 48 hours (RF-052).
 * Container: owns both lists and the drawer with the form.
 */
export default function MySessions() {
  const pending = usePendingSlots();
  const recorded = usePagedList(listMySessions, { subject: null }, sameFilters);
  const heading = useRef<HTMLHeadingElement>(null);
  const drawer = useDrawerState<SessionFormMode>(heading);
  const [notice, setNotice] = useState<string | null>(null);

  function saved(message: string) {
    drawer.close();
    setNotice(message);
    pending.reload();
    recorded.reload();
  }

  const panel = drawer.panel;
  const sessions = recorded.data?.results ?? [];

  return (
    <section className={styles.page} aria-labelledby="sessions-title">
      <PageHeader
        title="Sesiones"
        titleId="sessions-title"
        lead={`Registra la asistencia y los temas de cada monitoría que ya empezó. Puedes corregir una sesión durante las ${EDIT_WINDOW_HOURS} horas siguientes a su registro.`}
      />

      {notice && <Alert tone="success">{notice}</Alert>}

      <section className={styles.panel} aria-labelledby="pending-title">
        <h2 id="pending-title" ref={heading} tabIndex={-1} className={styles.sectionTitle}>
          Por registrar
        </h2>
        {pending.error && (
          <div className={styles.failure}>
            <Alert tone="error">{pending.error}</Alert>
            <Button variant="ghost" size="sm" onClick={pending.reload}>
              <Icon name="refresh" />
              Intentar de nuevo
            </Button>
          </div>
        )}
        {pending.data === null && !pending.error && (
          <div className={styles.skeleton} aria-hidden="true" />
        )}
        {pending.data && pending.data.length === 0 && (
          <div className={styles.empty}>
            <EmptyState title="No tienes monitorías por registrar.">
              <p>Cuando empiece una monitoría con reservas, aparecerá aquí.</p>
            </EmptyState>
          </div>
        )}
        {pending.data && pending.data.length > 0 && (
          <ul className={styles.list} aria-label="Monitorías por registrar">
            {pending.data.map((item) => (
              <li key={item.slot.id}>
                <article className={styles.card}>
                  <SlotHeading slot={item.slot} />
                  <p className={styles.who}>
                    <Icon name="users" size={14} />
                    {item.reservations
                      .map((reservation) => reservation.student.full_name || "Sin nombre")
                      .join(", ")}
                  </p>
                  <Button
                    size="sm"
                    className={styles.cardAction}
                    aria-label={`Registrar sesión de ${slotLabel(item.slot)}`}
                    onClick={(event) => drawer.open({ kind: "record", pending: item }, event)}
                  >
                    Registrar sesión
                  </Button>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="recorded-title">
        <h2 id="recorded-title" className={styles.sectionTitle}>
          Registradas
        </h2>
        {recorded.error && (
          <div className={styles.failure}>
            <Alert tone="error">{recorded.error}</Alert>
            <Button variant="ghost" size="sm" onClick={recorded.reload}>
              <Icon name="refresh" />
              Intentar de nuevo
            </Button>
          </div>
        )}
        {recorded.data === null && !recorded.error && (
          <div className={styles.skeleton} aria-hidden="true" />
        )}
        {recorded.data && sessions.length === 0 && !recorded.error && (
          <div className={styles.empty}>
            <EmptyState title="Aún no has registrado sesiones." />
          </div>
        )}
        {sessions.length > 0 && (
          <ul
            className={styles.list}
            aria-label="Sesiones registradas"
            aria-busy={recorded.loading}
          >
            {sessions.map((session) => (
              <li key={session.id}>
                <RecordedCard
                  session={session}
                  onEdit={(event) => drawer.open({ kind: "edit", session }, event)}
                />
              </li>
            ))}
          </ul>
        )}
        {recorded.data && (recorded.data.previous || recorded.data.next) && (
          <nav className={styles.pager} aria-label="Páginas de sesiones">
            <Button
              variant="ghost"
              size="sm"
              softDisabled={!recorded.data.previous || recorded.loading}
              onClick={() => recorded.goTo(recorded.page - 1)}
            >
              Anterior
            </Button>
            <span className={styles.pageNumber}>{`Página ${recorded.page}`}</span>
            <Button
              variant="ghost"
              size="sm"
              softDisabled={!recorded.data.next || recorded.loading}
              onClick={() => recorded.goTo(recorded.page + 1)}
            >
              Siguiente
            </Button>
          </nav>
        )}
      </section>

      {panel && (
        <Drawer
          key={panel.kind === "record" ? `record-${panel.pending.slot.id}` : panel.session.id}
          title={panel.kind === "record" ? "Registrar sesión" : "Editar sesión"}
          subtitle={
            panel.kind === "record" ? panel.pending.slot.subject.name : panel.session.slot.subject.name
          }
          locked={drawer.busy}
          onClose={drawer.close}
        >
          <SessionForm mode={panel} onSaved={saved} onBusyChange={drawer.setBusy} />
        </Drawer>
      )}
    </section>
  );
}

function SlotHeading({ slot }: { slot: SessionSlot }) {
  return (
    <>
      <header className={styles.cardHeader}>
        <div>
          <p className={styles.code}>{slot.subject.code}</p>
          <h3 className={styles.subject}>{slot.subject.name}</h3>
        </div>
      </header>
      <p className={styles.when}>
        <Icon name="clock" size={14} />
        <span className={styles.day}>{slotDayLabel(slot.starts_at)}</span>
        <span>{slotTimeRange(slot.starts_at, slot.ends_at)}</span>
      </p>
    </>
  );
}

/** A recorded session; "Editar" only while the 48-hour window is open (RF-052). */
function RecordedCard({
  session,
  onEdit,
}: {
  session: TutoringSession;
  onEdit: (event: { currentTarget: HTMLElement }) => void;
}) {
  const editable = isEditable(session);
  return (
    <article className={styles.card}>
      <SlotHeading slot={session.slot} />
      <p className={styles.who}>
        <Icon name="users" size={14} />
        {`${attendanceSummary(session.attendance)} · ${durationLabel(session.duration_minutes)}`}
      </p>
      {session.topics.length > 0 && (
        <p className={styles.topics}>{session.topics.map((topic) => topic.name).join(" · ")}</p>
      )}
      {editable ? (
        <Button
          variant="ghost"
          size="sm"
          className={styles.cardAction}
          aria-label={`Editar sesión de ${slotLabel(session.slot)}`}
          onClick={onEdit}
        >
          <Icon name="edit" />
          Editar
        </Button>
      ) : (
        <p className={styles.locked}>
          {`Ya no se puede editar · registrada el ${formatDateTime(session.recorded_at)}`}
        </p>
      )}
    </article>
  );
}
