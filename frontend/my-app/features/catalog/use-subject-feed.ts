"use client";

import { useEffect, useState } from "react";

import { requestErrorMessage } from "@/lib/api-client";
import { listSubjects, type Subject, type SubjectFilters } from "@/lib/catalog";

type Request = { filters: SubjectFilters; page: number; attempt: number };

type Feed = {
  /** The request the items answer; any other one is still loading. */
  answered: Request | null;
  items: Subject[];
  count: number | null;
  hasMore: boolean;
  error: string | null;
};

/**
 * The subject catalog one page at a time, each new page appended to the ones already
 * shown (infinite scroll). New filters start again from page 1; the previous results stay
 * in view until the new ones arrive, so the grid does not flash.
 */
export function useSubjectFeed(initialFilters: SubjectFilters) {
  const [request, setRequest] = useState<Request>({ filters: initialFilters, page: 1, attempt: 0 });
  const [feed, setFeed] = useState<Feed>({
    answered: null,
    items: [],
    count: null,
    hasMore: false,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    listSubjects(request.page, request.filters, controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return;
        setFeed((current) => {
          const kept = request.page === 1 ? [] : current.items;
          const seen = new Set(kept.map((item) => item.id));
          return {
            answered: request,
            items: [...kept, ...data.results.filter((item) => !seen.has(item.id))],
            count: data.count,
            hasMore: Boolean(data.next),
            error: null,
          };
        });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const message = requestErrorMessage(error);
        setFeed((current) =>
          // A failed first page must not leave the results of other filters in view.
          request.page === 1
            ? { answered: request, items: [], count: null, hasMore: false, error: message }
            : { ...current, answered: request, error: message },
        );
      },
    );
    return () => controller.abort();
  }, [request]);

  const loading = feed.answered !== request;
  const failed = !loading && feed.error !== null;

  return {
    filters: request.filters,
    items: feed.items,
    count: feed.count,
    /** Nothing has been received for these filters yet (first page in flight). */
    initial: loading && feed.count === null,
    loading,
    /** A first page for new filters is loading over the previous results. */
    refreshing: loading && request.page === 1,
    loadingMore: loading && request.page > 1,
    hasMore: feed.hasMore,
    error: failed ? feed.error : null,
    setFilters(filters: SubjectFilters) {
      setRequest((current) => ({ filters, page: 1, attempt: current.attempt + 1 }));
    },
    loadMore() {
      if (loading || !feed.hasMore) return;
      setRequest((current) => ({ ...current, page: current.page + 1, attempt: current.attempt + 1 }));
    },
    retry() {
      setRequest((current) => ({ ...current, attempt: current.attempt + 1 }));
    },
  };
}
