"use client";

import { useEffect, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import Icon from "@/components/ui/icon";
import ToggleChip from "@/components/ui/toggle-chip";
import { requestErrorMessage } from "@/lib/api-client";
import { bogotaDateTime, listMySlots, type Slot, type SlotStatus } from "@/lib/availability";

import {
  durationLabel,
  MODALITY_LABELS,
  relativeDayLabel,
  sessionLabel,
  slotDayLabel,
  slotsCountLabel,
  slotTimeRange,
  STATUS_LABELS,
} from "../labels";
import list from "./monitor-slots.module.css";
import styles from "./slot-agenda.module.css";

type View = "upcoming" | "all" | SlotStatus;

const VIEWS: { key: View; label: string }[] = [
  { key: "upcoming", label: "Próximas" },
  { key: "AVAILABLE", label: "Disponibles" },
  { key: "RESERVED", label: "Sin cupos" },
  { key: "CANCELLED", label: "Retiradas" },
  { key: "EXPIRED", label: "Vencidas" },
  { key: "all", label: "Todas" },
];

const EMPTY_TITLES: Record<View, string> = {
  upcoming: "No tienes franjas desde hoy en adelante.",
  all: "Aún no has publicado franjas en este período.",
  AVAILABLE: "Ninguna franja está disponible.",
  RESERVED: "Ninguna franja tiene todos sus cupos reservados.",
  CANCELLED: "No has retirado franjas.",
  EXPIRED: "Ninguna franja ha vencido.",
};

type SlotAgendaProps = {
  term: string;
  subjectId: number;
  today: string;
  /** Changes whenever the availability changed elsewhere, so the list is read again. */
  version: number;
  /** `opener` gets focus back when the slot's drawer closes. */
  onOpen: (slot: Slot, opener: HTMLElement) => void;
};

type Loaded = { slots: Slot[]; count: number; page: number; hasMore: boolean };

/**
 * The assignment's slots as a list grouped by Bogotá day, every state included, with filters
 * by state and more pages on demand. Container: owns the filter and the pages read so far.
 */
export default function SlotAgenda({ term, subjectId, today, version, onOpen }: SlotAgendaProps) {
  const [view, setView] = useState<View>("upcoming");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const requestKey = `${view}|${page}|${version}|${attempt}`;
  const [settled, setSettled] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const status = view === "upcoming" || view === "all" ? null : view;
    listMySlots(
      page,
      { term, subject: subjectId, status, dateFrom: view === "upcoming" ? today : null },
      controller.signal,
    ).then(
      (result) => {
        if (controller.signal.aborted) return;
        setLoaded((previous) => ({
          slots: page === 1 || !previous ? result.results : [...previous.slots, ...result.results],
          count: result.count,
          page,
          hasMore: result.next !== null,
        }));
        setSettled(requestKey);
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setFailure({ key: requestKey, message: requestErrorMessage(error) });
        }
      },
    );
    return () => controller.abort();
  }, [requestKey, view, page, term, subjectId, today]);

  function choose(next: View) {
    if (next === view) return;
    setLoaded(null);
    setPage(1);
    setView(next);
  }

  const error = failure?.key === requestKey ? failure.message : null;
  const loading = settled !== requestKey && error === null;
  const groups: { date: string; slots: Slot[] }[] = [];
  for (const slot of loaded?.slots ?? []) {
    const date = bogotaDateTime(slot.starts_at).date;
    const last = groups.at(-1);
    if (last?.date === date) last.slots.push(slot);
    else groups.push({ date, slots: [slot] });
  }

  return (
    <div className={list.panel}>
      <div className={list.toolbar}>
        <div className={`${list.chips} ${styles.chips}`} role="group" aria-label="Mostrar">
          {VIEWS.map((item) => (
            <ToggleChip key={item.key} pressed={view === item.key} onClick={() => choose(item.key)}>
              {item.label}
            </ToggleChip>
          ))}
        </div>
        <p role="status" className={list.status}>
          {loaded ? slotsCountLabel(loaded.count) : "Cargando tus franjas…"}
        </p>
      </div>

      {error && (
        <div className={list.failure}>
          <Alert tone="error">{error}</Alert>
          <Button variant="ghost" size="sm" onClick={() => setAttempt((value) => value + 1)}>
            <Icon name="refresh" />
            Intentar de nuevo
          </Button>
        </div>
      )}

      {loaded === null && !error && (
        <div className={list.skeletons} aria-hidden="true">
          <div className={list.skeleton} />
          <div className={list.skeleton} />
        </div>
      )}

      {loaded && loaded.slots.length === 0 && (
        <div className={list.empty}>
          <EmptyState title={EMPTY_TITLES[view]}>
            <p>Usa el calendario de la semana para publicar una franja en una hora libre.</p>
          </EmptyState>
        </div>
      )}

      {groups.length > 0 && (
        <div className={list.days} aria-busy={loading}>
          {groups.map((group) => {
            const first = group.slots[0] as Slot;
            const relative = relativeDayLabel(first.starts_at);
            const headingId = `agenda-${group.date}`;
            return (
              <section key={group.date} className={list.day} aria-labelledby={headingId}>
                <h3 id={headingId} className={`${list.dayHeading} ${styles.dayHeading}`}>
                  <span className={list.dayName}>{slotDayLabel(first.starts_at)}</span>
                  {relative && <span className={list.relative}>{relative}</span>}
                </h3>
                <ul className={list.slots}>
                  {group.slots.map((slot) => (
                    <li key={slot.id}>
                      <button
                        type="button"
                        className={`${list.slot} ${styles.row}`}
                        data-status={slot.status}
                        onClick={(event) => onOpen(slot, event.currentTarget)}
                      >
                        <span className={list.time}>
                          <span className={list.range}>
                            {slotTimeRange(slot.starts_at, slot.ends_at)}
                          </span>
                          <span className={list.duration}>
                            <Icon name="clock" size={14} />
                            {durationLabel(slot.starts_at, slot.ends_at)}
                          </span>
                        </span>
                        <span className={list.where}>
                          <span className={styles.state} data-status={slot.status}>
                            {STATUS_LABELS[slot.status]}
                          </span>
                          <span className={list.location} title={slot.location}>
                            {`${MODALITY_LABELS[slot.modality]} · ${slot.location}`}
                          </span>
                        </span>
                        <span className={list.session}>
                          <Icon name={slot.template !== null ? "repeat" : "users"} size={14} />
                          {sessionLabel(slot.capacity)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {loaded?.hasMore && !error && (
        <Button
          variant="ghost"
          className={list.more}
          softDisabled={loading}
          onClick={() => setPage(loaded.page + 1)}
        >
          {loading ? "Cargando…" : "Ver más franjas"}
        </Button>
      )}
    </div>
  );
}
