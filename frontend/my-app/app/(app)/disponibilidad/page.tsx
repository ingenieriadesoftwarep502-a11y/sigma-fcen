import type { Metadata } from "next";
import { Suspense } from "react";

import AvailabilityManager from "@/features/availability/components/availability-manager";
import RequireSession from "@/features/auth/session/require-session";

export const metadata: Metadata = { title: "Mi disponibilidad · SIGMA-FCEN" };

/** Monitors only: anyone else is sent home. The API enforces the role too (RN-003.5). */
export default function AvailabilityPage() {
  return (
    <RequireSession roles={["MONITOR"]}>
      {/* The tab and the term are read from the URL, which is only known in the browser. */}
      <Suspense fallback={null}>
        <AvailabilityManager />
      </Suspense>
    </RequireSession>
  );
}
