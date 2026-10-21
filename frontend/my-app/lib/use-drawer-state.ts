"use client";

import { type RefObject, useEffect, useRef, useState } from "react";

/**
 * What a list's side drawer is showing, whether a change is being stored, and where focus
 * goes back when it closes: the control that opened it, or `fallback` if that control is
 * gone (e.g. its row left the list).
 */
export function useDrawerState<P>(fallback: RefObject<HTMLElement | null>) {
  const [panel, setPanel] = useState<P | null>(null);
  const [busy, setBusy] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const restoring = useRef(false);

  // Focus moves back after the render that closes the drawer, once its opener is no longer
  // disabled by the save that just finished.
  useEffect(() => {
    if (panel !== null || !restoring.current) return;
    restoring.current = false;
    const target = opener.current?.isConnected ? opener.current : fallback.current;
    target?.focus();
  }, [panel, busy, fallback]);

  return {
    panel,
    busy,
    setBusy,
    open(next: P, event: { currentTarget: HTMLElement }) {
      opener.current = event.currentTarget;
      setPanel(next);
    },
    close() {
      restoring.current = true;
      setPanel(null);
      setBusy(false);
    },
  };
}
