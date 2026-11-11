"use client";

import { useSession } from "@/features/auth/session/session-provider";

import MonitorRating from "./monitor-rating";

/**
 * The signed-in monitor's own rating (T-06.12). Only the aggregate: the monitor never sees
 * who evaluated them nor what they wrote (RF-062).
 */
export default function OwnRating() {
  const { session } = useSession();
  if (session.status !== "authenticated") return null;
  return <MonitorRating monitorId={session.user.id} />;
}
