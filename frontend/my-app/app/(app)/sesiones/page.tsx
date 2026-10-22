import type { Metadata } from "next";

import RequireSession from "@/features/auth/session/require-session";
import MySessions from "@/features/sessions/components/my-sessions";

export const metadata: Metadata = { title: "Sesiones · SIGMA-FCEN" };

/**
 * Monitors record what happened in each started slot and correct it for 48 hours (HU-06).
 * The API checks that the slot is theirs (RN-006.4).
 */
export default function SessionsPage() {
  return (
    <RequireSession roles={["MONITOR"]}>
      <MySessions />
    </RequireSession>
  );
}
