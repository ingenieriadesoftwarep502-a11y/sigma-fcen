"use client";

import { useEffect, useState } from "react";

import { requestErrorMessage } from "@/lib/api-client";
import {
  type Department,
  getCurrentTerm,
  listAllDepartments,
  listAllTerms,
  type Term,
} from "@/lib/catalog";

type Loaded<T> = { data: T | null; error: string | null };

/** Loads a short reference list once, and again on `reload`. */
function useReference<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Loaded<T>>({ data: null, error: null });

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then(
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
  }, [load, attempt]);

  return { ...state, reload: () => setAttempt((value) => value + 1) };
}

async function loadTerms(signal: AbortSignal): Promise<{ terms: Term[]; current: Term | null }> {
  const [terms, current] = await Promise.all([listAllTerms(signal), getCurrentTerm(signal)]);
  return { terms, current };
}

/** Every term, newest first, and the current one (null when there are none yet). */
export function useTerms() {
  const { data, error, reload } = useReference(loadTerms);
  return { terms: data?.terms ?? null, current: data?.current ?? null, error, reload };
}

/** Every department the person may see (administrators also get inactive ones). */
export function useDepartments() {
  const { data, error, reload } = useReference<Department[]>(listAllDepartments);
  return { departments: data, error, reload };
}
