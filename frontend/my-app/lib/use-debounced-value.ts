"use client";

import { useEffect, useState } from "react";

/** Pause after the last keystroke before a search reaches the API. */
export const SEARCH_DELAY_MS = 300;

/** The value, once it has stayed the same for `delay` milliseconds. */
export function useDebouncedValue<T>(value: T, delay: number = SEARCH_DELAY_MS): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
