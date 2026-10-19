"use client";

import { useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import Icon from "@/components/ui/icon";
import SelectField from "@/components/ui/select-field";
import TextField from "@/components/ui/text-field";
import {
  AVAILABILITY_PAGE_SIZE,
  type Modality,
  NO_SLOT_SEARCH_FILTERS,
  type Slot,
  type SlotSearchFilters,
  searchSlots,
} from "@/lib/availability";
import { usePagedList } from "@/lib/use-paged-list";

import { MODALITY_LABELS, slotsCountLabel } from "../labels";
import SlotResultCard from "./slot-result-card";
import styles from "./slot-search.module.css";

const SKELETON_CARDS = 4;
const DATE_RANGE_MESSAGE = "La fecha final no puede ser anterior a la inicial.";

function sameFilters(a: SlotSearchFilters, b: SlotSearchFilters): boolean {
  return (
    a.term === b.term &&
    a.subject?.id === b.subject?.id &&
    a.monitor?.id === b.monitor?.id &&
    a.modality === b.modality &&
    a.dateFrom === b.dateFrom &&
    a.dateTo === b.dateTo
  );
}

type SlotSearchProps = {
  /** The subject whose slots are listed; fixed for the view. */
  subject: { id: number; code: string; name: string };
  /** Term code; null searches every term. */
  term: string | null;
};

function availableLabel(count: number): string {
  return `${slotsCountLabel(count)} ${count === 1 ? "disponible" : "disponibles"}`;
}

/**
 * The upcoming slots of one subject in a term, as students see them inside the subject
 * (T-03.17, HU-02): only available, future slots, ordered by start, with combinable filters
 * by monitor, modality and Bogotá date range. Each result says whether the session is
 * individual or a group one and how many seats it has. Booking arrives in FASE-04.
 * Container: owns the filters and the page in view.
 */
export default function SlotSearch({ subject, term }: SlotSearchProps) {
  // The subject and term frame the view: clearing the filters keeps them.
  const [base] = useState<SlotSearchFilters>(() => ({ ...NO_SLOT_SEARCH_FILTERS, term, subject }));
  const list = usePagedList(searchSlots, base, sameFilters);
  // The dates as typed: a reversed range stays here, with its message, and is never sent.
  const [dates, setDates] = useState({ from: "", to: "" });
  const filters = list.filters;
  const reversed = dates.from !== "" && dates.to !== "" && dates.to < dates.from;

  function changeDates(next: { from: string; to: string }) {
    setDates(next);
    if (next.from && next.to && next.to < next.from) return;
    list.setFilters({ ...filters, dateFrom: next.from || null, dateTo: next.to || null });
  }

  function clearFilters() {
    setDates({ from: "", to: "" });
    list.setFilters(base);
  }

  function pickMonitor(slot: Slot) {
    list.setFilters({
      ...filters,
      monitor: { id: slot.monitor.id, name: slot.monitor.full_name || "Monitor sin nombre" },
    });
  }

  const data = list.data;
  const firstLoad = data === null && list.error === null;
  const pages = data ? Math.max(1, Math.ceil(data.count / AVAILABILITY_PAGE_SIZE)) : 1;
  const empty = data !== null && data.results.length === 0;
  // An empty result offers its own way out; one "Limpiar filtros" at a time.
  const filtered = !sameFilters(filters, base);
  const showClear = (filtered || reversed) && !empty;

  let status = "";
  if (firstLoad) status = "Buscando franjas…";
  else if (data) status = availableLabel(data.count);

  return (
    <section className={styles.search} aria-labelledby="slot-search-title">
      <header className={styles.header}>
        <h2 id="slot-search-title" className={styles.title}>
          Próximas franjas
        </h2>
        <p className={styles.lead}>Franjas disponibles de sus monitores, en hora de Bogotá.</p>
      </header>

      <div className={styles.filters} role="search" aria-label="Filtrar franjas">
        <SelectField
          id="slot-search-modality"
          label="Modalidad"
          variant="form"
          value={filters.modality ?? ""}
          onChange={(value) =>
            list.setFilters({ ...filters, modality: (value || null) as Modality | null })
          }
        >
          <option value="">Cualquier modalidad</option>
          {(Object.keys(MODALITY_LABELS) as Modality[]).map((modality) => (
            <option key={modality} value={modality}>
              {MODALITY_LABELS[modality]}
            </option>
          ))}
        </SelectField>
        <TextField
          id="slot-search-from"
          label="Desde"
          type="date"
          value={dates.from}
          onChange={(event) => changeDates({ ...dates, from: event.target.value })}
          variant="glass"
        />
        <TextField
          id="slot-search-to"
          label="Hasta"
          type="date"
          min={dates.from || undefined}
          value={dates.to}
          onChange={(event) => changeDates({ ...dates, to: event.target.value })}
          errors={reversed ? [DATE_RANGE_MESSAGE] : []}
          variant="glass"
        />
      </div>

      {(filters.monitor || showClear) && (
        <div className={styles.active}>
          {filters.monitor && (
            <span className={styles.chip}>
              {`Monitor: ${filters.monitor.name}`}
              <button
                type="button"
                className={styles.chipRemove}
                aria-label="Quitar el filtro de monitor"
                onClick={() => list.setFilters({ ...filters, monitor: null })}
              >
                <Icon name="close" size={14} />
              </button>
            </span>
          )}
          {showClear && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Limpiar filtros
            </Button>
          )}
        </div>
      )}

      <section className={styles.results} aria-labelledby="slot-results-title">
        <h3 id="slot-results-title" className="sr-only">
          Resultados
        </h3>
        <p role="status" className={styles.status}>
          {status}
        </p>

        {list.error && (
          <div className={styles.failure}>
            <Alert tone="error">{list.error}</Alert>
            <Button variant="ghost" size="sm" onClick={list.reload}>
              <Icon name="refresh" />
              Intentar de nuevo
            </Button>
          </div>
        )}

        {firstLoad && (
          <div className={styles.grid} aria-hidden="true">
            {Array.from({ length: SKELETON_CARDS }, (_, index) => (
              <div key={index} className={styles.skeleton} />
            ))}
          </div>
        )}

        {empty && (
          <div className={styles.empty}>
            {filtered ? (
              <EmptyState
                title="Ninguna franja coincide con los filtros."
                action={
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    Limpiar filtros
                  </Button>
                }
              >
                <p>Prueba con otra modalidad, amplía el rango de fechas o quita algún filtro.</p>
              </EmptyState>
            ) : (
              <EmptyState title="Esta asignatura aún no tiene franjas disponibles.">
                <p>Cuando sus monitores publiquen su disponibilidad, aparecerá aquí.</p>
              </EmptyState>
            )}
          </div>
        )}

        {data && data.results.length > 0 && (
          <ul
            className={styles.grid}
            aria-label="Franjas disponibles"
            aria-busy={list.loading}
            data-refreshing={list.loading || undefined}
          >
            {data.results.map((slot) => (
              <li key={slot.id}>
                <SlotResultCard
                  slot={slot}
                  onPickMonitor={filters.monitor ? undefined : () => pickMonitor(slot)}
                />
              </li>
            ))}
          </ul>
        )}

        {data && (pages > 1 || list.page > 1) && (
          <nav className={styles.pager} aria-label="Paginación de resultados">
            <Button
              variant="ghost"
              size="sm"
              softDisabled={!data.previous || list.loading}
              onClick={() => list.goTo(list.page - 1)}
            >
              Anterior
            </Button>
            <span className={styles.pageInfo}>{`Página ${list.page} de ${pages}`}</span>
            <Button
              variant="ghost"
              size="sm"
              softDisabled={!data.next || list.loading}
              onClick={() => list.goTo(list.page + 1)}
            >
              Siguiente
            </Button>
          </nav>
        )}
      </section>
    </section>
  );
}
