"use client";

import Alert from "@/components/ui/alert";
import Button, { ButtonLink } from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import Icon from "@/components/ui/icon";
import PageHeader from "@/components/ui/page-header";
import ToggleChip from "@/components/ui/toggle-chip";
import { slotDayLabel, slotTimeRange } from "@/features/availability/labels";
import { SUBJECTS_PATH } from "@/lib/auth";
import {
  type HistoryFilters,
  type HistoryItem,
  type HistoryStatus,
  listHistory,
  NO_HISTORY_FILTERS,
} from "@/lib/sessions";
import { usePagedList } from "@/lib/use-paged-list";

import { durationLabel, HISTORY_STATUS_LABELS } from "../labels";
import styles from "./sessions.module.css";

const STATUS_FILTERS: readonly { status: HistoryStatus | null; label: string }[] = [
  { status: null, label: "Todas" },
  { status: "COMPLETED", label: "Asistencias" },
  { status: "NO_SHOW", label: "Inasistencias" },
];

function sameFilters(a: HistoryFilters, b: HistoryFilters): boolean {
  return a.status === b.status && a.subject === b.subject;
}

/**
 * The student's history (T-05.17, HU-12): every monitoring that already closed, attended or
 * missed, latest first, with its subject, monitor and topics. The monitor's notes are not
 * part of it (RN-006.9). Container: owns the list and its filter.
 */
export default function SessionHistory() {
  const list = usePagedList(listHistory, NO_HISTORY_FILTERS, sameFilters);
  const items = list.data?.results ?? [];
  const firstLoad = list.data === null && list.error === null;

  return (
    <section className={styles.page} aria-labelledby="history-title">
      <PageHeader
        title="Historial"
        titleId="history-title"
        lead="Las monitorías a las que asististe y las que perdiste, con los temas que se trabajaron."
      />

      <div className={styles.toolbar} role="group" aria-label="Qué monitorías ver">
        {STATUS_FILTERS.map((filter) => (
          <ToggleChip
            key={filter.label}
            pressed={list.filters.status === filter.status}
            onClick={() => list.setFilters({ ...list.filters, status: filter.status })}
          >
            {filter.label}
          </ToggleChip>
        ))}
      </div>

      {list.error && (
        <div className={styles.failure}>
          <Alert tone="error">{list.error}</Alert>
          <Button variant="ghost" size="sm" onClick={list.reload}>
            <Icon name="refresh" />
            Intentar de nuevo
          </Button>
        </div>
      )}

      {firstLoad && <div className={styles.skeleton} aria-hidden="true" />}

      {list.data && items.length === 0 && !list.error && (
        <div className={styles.empty}>
          <EmptyState
            title={
              list.filters.status === null
                ? "Aún no tienes monitorías en tu historial."
                : "No hay monitorías con ese resultado."
            }
            action={
              list.filters.status === null ? (
                <ButtonLink href={SUBJECTS_PATH} variant="ghost" size="sm">
                  Buscar monitorías
                </ButtonLink>
              ) : undefined
            }
          />
        </div>
      )}

      {items.length > 0 && (
        <ul className={styles.list} aria-label="Tu historial de monitorías" aria-busy={list.loading}>
          {items.map((item) => (
            <li key={item.id}>
              <HistoryCard item={item} />
            </li>
          ))}
        </ul>
      )}

      {list.data && (list.data.previous || list.data.next) && (
        <nav className={styles.pager} aria-label="Páginas del historial">
          <Button
            variant="ghost"
            size="sm"
            softDisabled={!list.data.previous || list.loading}
            onClick={() => list.goTo(list.page - 1)}
          >
            Anterior
          </Button>
          <span className={styles.pageNumber}>{`Página ${list.page}`}</span>
          <Button
            variant="ghost"
            size="sm"
            softDisabled={!list.data.next || list.loading}
            onClick={() => list.goTo(list.page + 1)}
          >
            Siguiente
          </Button>
        </nav>
      )}
    </section>
  );
}

/** One closed reservation: what, when, with whom, how it ended and the topics. */
function HistoryCard({ item }: { item: HistoryItem }) {
  const { slot, status, session } = item;
  return (
    <article className={styles.card} data-status={status}>
      <header className={styles.cardHeader}>
        <div>
          <p className={styles.code}>{slot.subject.code}</p>
          <h2 className={styles.subject}>{slot.subject.name}</h2>
        </div>
        <span className={styles.status} data-status={status}>
          {HISTORY_STATUS_LABELS[status]}
        </span>
      </header>
      <p className={styles.when}>
        <Icon name="clock" size={14} />
        <span className={styles.day}>{slotDayLabel(slot.starts_at)}</span>
        <span>{slotTimeRange(slot.starts_at, slot.ends_at)}</span>
      </p>
      <p className={styles.who}>
        <Icon name="users" size={14} />
        {`Con ${slot.monitor.full_name || "monitor sin nombre"}`}
      </p>
      {session && session.topics.length > 0 && (
        <p className={styles.topics}>
          {`${session.topics.map((topic) => topic.name).join(" · ")} · ${durationLabel(session.duration_minutes)}`}
        </p>
      )}
      {status === "COMPLETED" && (
        // The evaluation arrives with FASE-06 (ADR-013); until then it is always pending.
        <p className={styles.locked}>Sin evaluar</p>
      )}
    </article>
  );
}
