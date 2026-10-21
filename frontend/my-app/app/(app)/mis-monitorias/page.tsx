import type { Metadata } from "next";
import { Suspense } from "react";

import RequireSession from "@/features/auth/session/require-session";
import MyMonitoring from "@/features/catalog/components/my-monitoring";

export const metadata: Metadata = { title: "Mis monitorías · SIGMA-FCEN" };

/** Monitors only: anyone else is sent home. The API enforces the role too (RN-009.1). */
export default function MyMonitoringPage() {
  return (
    <RequireSession roles={["MONITOR"]}>
      {/* The term is read from the URL, which is only known in the browser. */}
      <Suspense fallback={null}>
        <MyMonitoring />
      </Suspense>
    </RequireSession>
  );
}
