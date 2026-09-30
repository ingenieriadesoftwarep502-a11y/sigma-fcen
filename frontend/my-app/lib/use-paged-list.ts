"use client";

import { useEffect, useState } from "react";

import { requestErrorMessage } from "@/lib/api-client";

type Query<F> = { page: number; filters: F; attempt: number };

type ListState<F, P> = {
  /** The last page received; kept while the next one loads so the list does not flash. */
  data: P | null;
  error: string | null;
  /** The query the current data or error answers; any other query is still loading. */
  settled: Query<F> | null;
};

/**
 * One page of a filterable list, loaded from the API: changing the filters goes back to
 * page 1, and a newer request always wins over an older one still in flight.
 * `load` must be stable (a module-level function).
 */
export function usePagedList<F, P>(
  load: (page: number, filters: F, signal: AbortSignal) => Promise<P>,
  initialFilters: F,
  same: (a: F, b: F) => boolean,
) {
  const [query, setQuery] = useState<Query<F>>({ page: 1, filters: initialFilters, attempt: 0 });
  const [list, setList] = useState<ListState<F, P>>({ data: null, error: null, settled: null });

  useEffect(() => {
    const controller = new AbortController();
    load(query.page, query.filters, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setList({ data, error: null, settled: query });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setList((current) => ({ ...current, error: requestErrorMessage(error), settled: query }));
      },
    );
    return () => controller.abort();
  }, [load, query]);

  const loading = list.settled !== query;

  return {
    page: query.page,
    filters: query.filters,
    data: list.data,
    loading,
    error: loading ? null : list.error,
    /** Applies new filters from page 1; false when they are the ones in use. */
    setFilters(filters: F): boolean {
      if (same(filters, query.filters)) return false;
      setQuery((current) => ({ page: 1, filters, attempt: current.attempt + 1 }));
      return true;
    },
    goTo(page: number) {
      setQuery((current) => ({ ...current, page, attempt: current.attempt + 1 }));
    },
    /** Asks again for the page in view, e.g. after a change or a failure. */
    reload() {
      setQuery((current) => ({ ...current, attempt: current.attempt + 1 }));
    },
  };
}
