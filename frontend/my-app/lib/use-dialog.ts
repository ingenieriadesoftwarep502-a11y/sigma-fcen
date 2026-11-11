"use client";

import { type RefObject, useEffect, useEffectEvent } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

type DialogOptions = {
  /** Behaviors apply only while true, e.g. while an off-canvas menu is open. */
  active?: boolean;
  /** While true, Escape does nothing (a change is being stored). */
  locked?: boolean;
  /** Escape was pressed. */
  onDismiss: () => void;
};

function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => !element.closest("[hidden], [inert]"),
  );
}

/**
 * Modal behaviors for a dialog-like container: Escape dismisses it, Tab and Shift+Tab
 * wrap inside it, and the page behind it does not scroll. Restoring focus to the opener
 * is left to the caller, which knows what opened it.
 */
export function useDialog(
  container: RefObject<HTMLElement | null>,
  { active = true, locked = false, onDismiss }: DialogOptions,
): void {
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const element = container.current;
    if (!element) return;
    if (event.key === "Escape") {
      if (!locked) {
        event.preventDefault();
        onDismiss();
      }
      return;
    }
    if (event.key !== "Tab") return;

    const items = focusableWithin(element);
    const first = items[0];
    const last = items[items.length - 1];
    const current = document.activeElement;
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    if (!element.contains(current)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && (current === first || current === element)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && current === last) {
      event.preventDefault();
      first.focus();
    }
  });

  useEffect(() => {
    if (!active) return;
    const { style } = document.body;
    const previousOverflow = style.overflow;
    style.overflow = "hidden";
    const listener = (event: KeyboardEvent) => handleKeyDown(event);
    document.addEventListener("keydown", listener);
    return () => {
      document.removeEventListener("keydown", listener);
      style.overflow = previousOverflow;
    };
  }, [active]);
}
