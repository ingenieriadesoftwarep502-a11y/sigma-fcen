"use client";

import { type PointerEvent, type ReactNode, useEffect, useRef } from "react";

import styles from "./glass-card.module.css";

/**
 * Translucent card whose edge light follows the pointer. The card is measured once per
 * hover and the light moves at most once per frame, so the blurred layer is not
 * re-laid-out on every pointer event.
 */
export default function GlassCard({ children }: { children: ReactNode }) {
  const bounds = useRef<DOMRect | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const frame = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  function measure(event: PointerEvent<HTMLDivElement>) {
    bounds.current = event.currentTarget.getBoundingClientRect();
  }

  function follow(event: PointerEvent<HTMLDivElement>) {
    pointer.current = { x: event.clientX, y: event.clientY };
    if (frame.current !== null) return;
    const card = event.currentTarget;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const box = (bounds.current ??= card.getBoundingClientRect());
      card.style.setProperty("--glow-x", `${pointer.current.x - box.left}px`);
      card.style.setProperty("--glow-y", `${pointer.current.y - box.top}px`);
    });
  }

  return (
    <div className={styles.card} onPointerEnter={measure} onPointerMove={follow}>
      {children}
    </div>
  );
}
