"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import Icon from "@/components/ui/icon";
import PageHeader from "@/components/ui/page-header";
import SearchField from "@/components/ui/search-field";
import SelectField from "@/components/ui/select-field";
import ToggleChip from "@/components/ui/toggle-chip";
import { useSession } from "@/features/auth/session/session-provider";
import { getSubject, NO_SUBJECT_FILTERS, type Subject, type SubjectFilters } from "@/lib/catalog";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useUrlQuery } from "@/lib/use-url-query";

import {
  explorerFiltersFromParams,
  hasExplorerFilters,
  paramsFromExplorerFilters,
  sameFilters,
} from "../filters";
import { countLabel, creditsLabel, formatCount } from "../labels";
import { usePinnedSubjects } from "../pinned-subjects";
import { useDepartments, useTerms } from "../use-catalog-reference";
import { useSubjectFeed } from "../use-subject-feed";
import SubjectCard, { SubjectCardSkeleton } from "./subject-card";
import styles from "./subject-explorer.module.css";
import TermSelect from "./term-select";

const CREDIT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const SKELETON_CARDS = 6;
function shownLabel(shown: number, count: number): string {
  return `Mostrando ${formatCount(shown)} de ${countLabel(count, "asignatura", "asignaturas")}`;
}

/** The pinned subjects, read one by one for the term in view; vanished ones are skipped. */
function usePinnedData(ids: readonly number[], term: string | null) {
  const [loaded, setLoaded] = useState<Subject[]>([]);
  const key = ids.join(",");

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const wanted = key.split(",").map(Number);
    Promise.allSettled(wanted.map((id) => getSubject(id, term, controller.signal))).then(
      (outcomes) => {
        if (controller.signal.aborted) return;
        setLoaded(
          outcomes.flatMap((outcome) => (outcome.status === "fulfilled" ? [outcome.value] : [])),
        );
      },
    );
    return () => controller.abort();
  }, [key, term]);

  // Unpinning is instant: the list follows the ids before any request settles.
  return {
    subjects: ids.flatMap((id) => loaded.filter((subject) => subject.id === id)),
    pending: ids.some((id) => !loaded.some((subject) => subject.id === id)),
  };
}

/**
 * The subject catalog as students and monitors browse it (FASE-02): a search first, then
 * quick filters, subjects kept at hand, and every match as a card, loaded page by page as
 * the person scrolls. Filters live in the URL.
 */
export default function SubjectExplorer() {
  const { session } = useSession();
  if (session.status !== "authenticated") return null;
  return <Explorer userId={session.user.id} />;
}

function Explorer({ userId }: { userId: string }) {
  const url = useUrlQuery();
  const [initialFilters] = useState(() => explorerFiltersFromParams(url.initial));
  const feed = useSubjectFeed(initialFilters);
  const [searchInput, setSearchInput] = useState(initialFilters.search);
  const search = useDebouncedValue(searchInput);
  const { terms, current } = useTerms();
  const { departments } = useDepartments();
  const pins = usePinnedSubjects(userId);
  const pinned = usePinnedData(pins.ids, feed.filters.term);
  const sentinel = useRef<HTMLDivElement>(null);

  const filters = feed.filters;

  function apply(next: SubjectFilters) {
    if (sameFilters(next, filters)) return;
    feed.setFilters(next);
    url.replace(paramsFromExplorerFilters(next));
  }

  const applySearch = useEffectEvent((value: string) => apply({ ...filters, search: value }));
  useEffect(() => applySearch(search), [search]);

  function clearFilters() {
    setSearchInput("");
    apply({ ...NO_SUBJECT_FILTERS, term: filters.term });
  }

  // Infinite scroll: the next page loads as the end of the grid approaches. The
  // "Cargar más" button below does the same for keyboards and older browsers.
  const reachEnd = useEffectEvent(() => {
    if (!feed.error) feed.loadMore();
  });
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !feed.hasMore || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) reachEnd();
      },
      { rootMargin: "480px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [feed.hasMore, feed.items.length]);

  const filtered = hasExplorerFilters(filters);
  const firstPageFailed = feed.error !== null && feed.count === null;
  let status = "";
  if (feed.initial) status = "Buscando asignaturas…";
  else if (feed.count !== null) status = shownLabel(feed.items.length, feed.count);

  return (
    <section className={styles.explorer} aria-labelledby="subjects-title">
      <PageHeader
        title="Asignaturas"
        titleId="subjects-title"
        lead="Busca una asignatura por código o nombre y mira si tiene monitores en el período."
      >
        <TermSelect
          id="subjects-term"
          value={filters.term}
          terms={terms}
          current={current}
          onChange={(term) => apply({ ...filters, term })}
          className={styles.term}
        />
      </PageHeader>

      <div className={styles.finder} role="search" aria-label="Buscar en el catálogo">
        <SearchField
          id="subjects-search"
          label="Buscar asignaturas"
          placeholder="Busca por código o nombre, por ejemplo MAT-101 o Cálculo"
          size="lg"
          value={searchInput}
          onChange={setSearchInput}
          onClear={() => {
            setSearchInput("");
            apply({ ...filters, search: "" });
          }}
          className={styles.search}
        />

        <div className={styles.quick}>
          <ToggleChip
            pressed={filters.hasMonitors}
            onClick={() => apply({ ...filters, hasMonitors: !filters.hasMonitors })}
          >
            Con monitores disponibles
          </ToggleChip>
          <SelectField
            id="subjects-credits"
            label="Créditos"
            className={styles.credits}
            value={filters.credits === null ? "" : String(filters.credits)}
            onChange={(value) => apply({ ...filters, credits: value ? Number(value) : null })}
          >
            <option value="">Cualquier número de créditos</option>
            {CREDIT_OPTIONS.map((credits) => (
              <option key={credits} value={credits}>
                {creditsLabel(credits)}
              </option>
            ))}
          </SelectField>
        </div>

        <div className={styles.departments} role="group" aria-label="Departamento">
          <ToggleChip
            pressed={filters.department === null}
            className={styles.snap}
            onClick={() => apply({ ...filters, department: null })}
          >
            Todos
          </ToggleChip>
          {departments?.map((department) => (
            <ToggleChip
              key={department.id}
              pressed={filters.department === department.code}
              className={styles.snap}
              onClick={() => apply({ ...filters, department: department.code })}
            >
              {department.name}
            </ToggleChip>
          ))}
        </div>
      </div>

      {pins.ids.length > 0 && (
        <section className={styles.pinned} aria-labelledby="pinned-title">
          <h2 id="pinned-title" className={styles.sectionTitle}>
            Mis asignaturas
          </h2>
          <ul className={styles.pinnedList}>
            {pinned.subjects.map((subject) => (
              <li key={subject.id}>
                <SubjectCard subject={subject} pinned onTogglePin={() => pins.toggle(subject.id)} />
              </li>
            ))}
            {pinned.pending && pinned.subjects.length === 0 && (
              <li>
                <SubjectCardSkeleton />
              </li>
            )}
          </ul>
        </section>
      )}

      <section className={styles.results} aria-labelledby="results-title">
        <div className={styles.resultsHeader}>
          <h2 id="results-title" className="sr-only">
            Resultados
          </h2>
          <p role="status" className={styles.status}>
            {status}
          </p>
        </div>

        {firstPageFailed && (
          <div className={styles.failure}>
            <Alert tone="error">{feed.error}</Alert>
            <Button variant="ghost" size="sm" onClick={feed.retry}>
              <Icon name="refresh" />
              Intentar de nuevo
            </Button>
          </div>
        )}

        {feed.initial && (
          <div className={styles.grid} aria-hidden="true">
            {Array.from({ length: SKELETON_CARDS }, (_, index) => (
              <SubjectCardSkeleton key={index} />
            ))}
          </div>
        )}

        {!feed.initial && feed.count === 0 && (
          <div className={styles.empty}>
            {filtered ? (
              <EmptyState
                title="Ninguna asignatura coincide."
                action={
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    Limpiar filtros
                  </Button>
                }
              >
                <p>
                  Revisa la ortografía, busca por código (por ejemplo MAT-101) o quita el filtro de
                  departamento, créditos o monitores.
                </p>
              </EmptyState>
            ) : (
              <EmptyState title="Aún no hay asignaturas en el catálogo.">
                <p>Cuando la facultad registre asignaturas, aparecerán aquí.</p>
              </EmptyState>
            )}
          </div>
        )}

        {feed.items.length > 0 && (
          <ul
            className={styles.grid}
            aria-labelledby="results-title"
            aria-busy={feed.refreshing}
            data-refreshing={feed.refreshing || undefined}
          >
            {feed.items.map((subject) => (
              <li key={subject.id}>
                <SubjectCard
                  subject={subject}
                  pinned={pins.isPinned(subject.id)}
                  onTogglePin={() => pins.toggle(subject.id)}
                />
              </li>
            ))}
          </ul>
        )}

        <div ref={sentinel} className={styles.more}>
          {feed.error && !firstPageFailed && (
            <div className={styles.failure}>
              <Alert tone="error">{feed.error}</Alert>
              <Button variant="ghost" size="sm" onClick={feed.retry}>
                <Icon name="refresh" />
                Intentar de nuevo
              </Button>
            </div>
          )}
          {feed.hasMore && !feed.error && (
            <Button variant="ghost" size="sm" softDisabled={feed.loading} onClick={feed.loadMore}>
              {feed.loadingMore ? "Cargando…" : "Cargar más"}
            </Button>
          )}
        </div>
      </section>
    </section>
  );
}

