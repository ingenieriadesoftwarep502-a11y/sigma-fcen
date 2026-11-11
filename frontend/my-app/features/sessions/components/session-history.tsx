"use client";

import { useEffect, useState } from "react";

import Alert from "@/components/ui/alert";
import Button, { ButtonLink } from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import Icon from "@/components/ui/icon";
import PageHeader from "@/components/ui/page-header";
import ToggleChip from "@/components/ui/toggle-chip";
import { slotDayLabel, slotTimeRange } from "@/features/availability/labels";
import HistoryEvaluation from "@/features/evaluations/components/history-evaluation";
import { SUBJECTS_PATH } from "@/lib/auth";
import { countPendingEvaluations, type EvaluationSummary } from "@/lib/evaluations";
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

/** T-06.10: how many attended sessions are still to evaluate; null until known. */
function usePendingCount(attempt: number) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    countPendingEvaluations(controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) setCount(value);
      },
      // The hint is a convenience: without it the history still offers "Evaluar".
      () => undefined,
    );
    return () => controller.abort();
  }, [attempt]);

  return [count, setCount] as const;
}

/**
 * The student's history (T-05.17, HU-12): every monitoring that already closed, attended or
 * missed, latest first, with its subject, monitor and topics. The monitor's notes are not
 * part of it (RN-006.9). An attended session can be evaluated in place, once (FASE-06).
 * Container: owns the list, its filter and the evaluations given here.
 */
export default function SessionHistory() {
  const list = usePagedList(listHistory, NO_HISTORY_FILTERS, sameFilters);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = usePendingCount(attempt);
  const [given, setGiven] = useState<Record<string, EvaluationSummary>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const items = (list.data?.results ?? []).map((item) =>
    given[item.id] ? { ...item, evaluation: given[item.id]! } : item,
  );
  const firstLoad = list.data === null && list.error === null;

  function evaluated(itemId: string, evaluation: EvaluationSummary) {
    setGiven((current) => ({ ...current, [itemId]: evaluation }));
    setPending((current) => (current === null ? null : Math.max(current - 1, 0)));
    setNotice("Gracias por evaluar la monitoría.");
  }

  function alreadyEvaluated() {
    setNotice(null);
    list.reload();
    setAttempt((current) => current + 1);
  }

  return (
    <section className={styles.page} aria-labelledby="history-title">
      <PageHeader
        title="Historial"
        titleId="history-title"
        lead="Las monitorías a las que asististe y las que perdiste, con los temas que se trabajaron."
      />

      {notice && <Alert tone="success">{notice}</Alert>}
      {pending !== null && pending > 0 && (
        <p className={styles.pendingHint}>
          {pending === 1
            ? "Tienes 1 monitoría por evaluar."
            : `Tienes ${pending} monitorías por evaluar.`}
        </p>
      )}

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
              <HistoryCard
                item={item}
                onEvaluated={(evaluation) => evaluated(item.id, evaluation)}
                onAlreadyEvaluated={alreadyEvaluated}
              />
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

/** One closed reservation: what, when, with whom, how it ended, the topics and the rating. */
function HistoryCard({
  item,
  onEvaluated,
  onAlreadyEvaluated,
}: {
  item: HistoryItem;
  onEvaluated: (evaluation: EvaluationSummary) => void;
  onAlreadyEvaluated: () => void;
}) {
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
      <HistoryEvaluation
        item={item}
        label={`Evaluar la monitoría de ${slot.subject.name} del ${slotDayLabel(slot.starts_at)}`}
        onEvaluated={onEvaluated}
        onAlreadyEvaluated={onAlreadyEvaluated}
      />
    </article>
  );
}
