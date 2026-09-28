"use client";

import type { PointerEvent, ReactNode } from "react";

/** Translucent card whose edge light follows the pointer. */
export default function GlassCard({ children }: { children: ReactNode }) {
  function follow(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--glow-x", `${event.clientX - box.left}px`);
    event.currentTarget.style.setProperty("--glow-y", `${event.clientY - box.top}px`);
  }

  return (
    <div className="glass-card" onPointerMove={follow}>
      {children}
    </div>
  );
}
