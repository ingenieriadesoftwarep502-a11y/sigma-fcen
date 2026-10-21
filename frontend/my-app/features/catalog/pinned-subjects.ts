"use client";

import { useEffect, useState } from "react";

import { getSubject, type Subject } from "@/lib/catalog";

/**
 * "Mis asignaturas": subjects a person keeps at hand, stored in this browser only, one list
 * per account. Storage can be missing or refused (private windows, blocked site data), so
 * every access is guarded and the list simply starts empty.
 */

const MAX_PINNED = 24;

export function pinnedKey(userId: string): string {
  return `sigma-fcen:asignaturas-fijadas:${userId}`;
}

export function readPinned(userId: string): number[] {
  try {
    const raw = localStorage.getItem(pinnedKey(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is number => Number.isInteger(id) && id > 0).slice(0, MAX_PINNED);
  } catch {
    return [];
  }
}

export function writePinned(userId: string, ids: readonly number[]): void {
  try {
    localStorage.setItem(pinnedKey(userId), JSON.stringify(ids));
  } catch {
    // Storage refused: the pins last until the page is closed.
  }
}

/** The pinned subject ids, most recent first, and a toggle that stores the change. */
export function usePinnedSubjects(userId: string) {
  const [ids, setIds] = useState<number[]>(() => readPinned(userId));

  function toggle(id: number) {
    const next = ids.includes(id)
      ? ids.filter((pinned) => pinned !== id)
      : [id, ...ids].slice(0, MAX_PINNED);
    setIds(next);
    writePinned(userId, next);
  }

  return { ids, toggle, isPinned: (id: number) => ids.includes(id) };
}

/** The pinned subjects, read one by one for the term in view; vanished ones are skipped. */
export function usePinnedData(ids: readonly number[], term: string | null) {
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
