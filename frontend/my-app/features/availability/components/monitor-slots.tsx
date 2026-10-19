"use client";

import { useEffect, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import Icon from "@/components/ui/icon";
import ToggleChip from "@/components/ui/toggle-chip";
import { requestErrorMessage } from "@/lib/api-client";
import {
  bogotaDateTime,
  isGroupSession,
  type Modality,
  NO_SLOT_SEARCH_FILTERS,
  type Slot,
  searchSlots,
} from "@/lib/availability";

import {
  availableSlotsLabel,
  durationLabel,
  MODALITY_LABELS,
  relativeDayLabel,
  sessionLabel,
  slotDayLabel,
  slotTimeRange,
} from "../labels";
import styles from "./monitor-slots.module.css";

const SKELETON_ROWS = 3;
const MODALITIES = Object.keys(MODALITY_LABELS) as Modality[];

type MonitorSlotsProps = {
  subject: { id: number; code: string; name: string };
  monitor: { id: string; name: string };
  /** Term code; null searches every term. */
  term: string | null;
};

type Loaded = {
  slots: Slot[];
  count: number;
  /** The last page read; the next "Ver más" asks for the one after it. */
  page: number;
  hasMore: boolean;
};

type DayGroup = { date: string; slots: Slot[] };

/** Consecutive slots of the same Bogotá day; the API already orders them by start. */
function byDay(slots: Slot[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const slot of slots) {
    const date = bogotaDateTime(slot.starts_at).date;
    const last = groups.at(-1);
    if (last?.date === date) last.slots.push(slot);
    else groups.push({ date, slots: [slot] });
  }
  return groups;
}

/**
 * The upcoming slots one monitor offers for a subject, grouped by day in Bogotá time, with a
 * modality filter and more pages on demand (HU-02, CA-HU02-1). Read-only: booking arrives in
 * FASE-04. Container: owns the filter and the pages read so far.
 */
export default function MonitorSlots({ subject, monitor, term }: MonitorSlotsProps) {
  const { id: subjectId, code: subjectCode, name: subjectName } = subject;
  const { id: monitorId, name: monitorName } = monitor;
  const [modality, setModality] = useState<Modality | null>(null);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // Each request is known by its key; what settled for an older key is no longer current.
  const requestKey = `${term}|${modality}|${page}|${attempt}`;
  const [settled, setSettled] = useState<string | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    searchSlots(
      page,
      {
        ...NO_SLOT_SEARCH_FILTERS,
        term,
        subject: { id: subjectId, code: subjectCode, name: subjectName },
        monitor: { id: monitorId, name: monitorName },
        modality,
      },
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
        if (controller.signal.aborted) return;
        setFailure({ key: requestKey, message: requestErrorMessage(error) });
      },
    );
    return () => controller.abort();
  }, [
    requestKey,
    page,
    modality,
    term,
    subjectId,
    subjectCode,
    subjectName,
    monitorId,
    monitorName,
  ]);

  const error = failure?.key === requestKey ? failure.message : null;
  const loading = settled !== requestKey && error === null;

  function chooseModality(next: Modality | null) {
    if (next === modality) return;
    setLoaded(null);
    setPage(1);
    setModality(next);
  }

  const firstLoad = loaded === null && error === null;
  const firstName = monitorName.split(" ")[0] || monitorName;

  let status = "";
  if (firstLoad) status = "Buscando franjas…";
  else if (loaded) status = availableSlotsLabel(loaded.count);

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <div className={styles.chips} role="group" aria-label="Modalidad">
          <ToggleChip pressed={modality === null} onClick={() => chooseModality(null)}>
            Todas
          </ToggleChip>
          {MODALITIES.map((value) => (
            <ToggleChip
              key={value}
              pressed={modality === value}
              onClick={() => chooseModality(value)}
            >
              <Icon name={value === "VIRTUAL" ? "video" : "place"} size={16} />
              {MODALITY_LABELS[value]}
            </ToggleChip>
          ))}
        </div>
        <p role="status" className={styles.status}>
          {status}
        </p>
      </div>

      {error && (
        <div className={styles.failure}>
          <Alert tone="error">{error}</Alert>
          <Button variant="ghost" size="sm" onClick={() => setAttempt((value) => value + 1)}>
            <Icon name="refresh" />
            Intentar de nuevo
          </Button>
        </div>
      )}

      {firstLoad && (
        <div className={styles.skeletons} aria-hidden="true">
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <div key={index} className={styles.skeleton} />
          ))}
        </div>
      )}

      {loaded && loaded.slots.length === 0 && !error && (
        <div className={styles.empty}>
          {modality ? (
            <EmptyState
              title={`${firstName} no tiene franjas ${modality === "VIRTUAL" ? "virtuales" : "presenciales"}.`}
              action={
                <Button variant="ghost" size="sm" onClick={() => chooseModality(null)}>
                  Ver todas
                </Button>
              }
            >
              <p>Prueba con la otra modalidad.</p>
            </EmptyState>
          ) : (
            <EmptyState title={`${firstName} no tiene franjas disponibles por ahora.`}>
              <p>Cuando publique su disponibilidad en {subjectName}, aparecerá aquí.</p>
            </EmptyState>
          )}
        </div>
      )}

      {loaded && loaded.slots.length > 0 && (
        <div className={styles.days} aria-busy={loading}>
          {byDay(loaded.slots).map((group) => {
            const first = group.slots[0] as Slot;
            const relative = relativeDayLabel(first.starts_at);
            const headingId = `day-${group.date}`;
            return (
              <section key={group.date} className={styles.day} aria-labelledby={headingId}>
                <h3 id={headingId} className={styles.dayHeading}>
                  <span className={styles.dayName}>{slotDayLabel(first.starts_at)}</span>
                  {relative && <span className={styles.relative}>{relative}</span>}
                </h3>
                <ul className={styles.slots}>
                  {group.slots.map((slot) => (
                    <li key={slot.id}>
                      <SlotRow slot={slot} />
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
          className={styles.more}
          softDisabled={loading}
          onClick={() => setPage(loaded.page + 1)}
        >
          {loading ? "Cargando…" : "Ver más franjas"}
        </Button>
      )}
    </div>
  );
}

/** One slot: its hours, how long it lasts, where, and how many seats. Presentational. */
function SlotRow({ slot }: { slot: Slot }) {
  const virtual = slot.modality === "VIRTUAL";
  const group = isGroupSession(slot.capacity);

  return (
    <article className={styles.slot} aria-label={slotTimeRange(slot.starts_at, slot.ends_at)}>
      <div className={styles.time}>
        <span className={styles.range}>{slotTimeRange(slot.starts_at, slot.ends_at)}</span>
        <span className={styles.duration}>
          <Icon name="clock" size={14} />
          {durationLabel(slot.starts_at, slot.ends_at)}
        </span>
      </div>
      <div className={styles.where}>
        <span className={styles.modality} data-virtual={virtual || undefined}>
          <Icon name={virtual ? "video" : "place"} size={16} />
          {MODALITY_LABELS[slot.modality]}
        </span>
        <span className={styles.location} title={slot.location}>
          {slot.location}
        </span>
      </div>
      <span className={styles.session} data-group={group || undefined}>
        <Icon name="users" size={14} />
        {sessionLabel(slot.capacity)}
      </span>
    </article>
  );
}
