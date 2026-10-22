import type { Metadata } from "next";

import RequireSession from "@/features/auth/session/require-session";
import SessionHistory from "@/features/sessions/components/session-history";

export const metadata: Metadata = { title: "Historial · SIGMA-FCEN" };

/** A student's closed monitorings (HU-12); the API returns only their own (CA-HU12-3). */
export default function HistoryPage() {
  return (
    <RequireSession roles={["STUDENT"]}>
      <SessionHistory />
    </RequireSession>
  );
}
