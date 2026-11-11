import type { Metadata } from "next";
import { Suspense } from "react";

import RequireSession from "@/features/auth/session/require-session";
import TeachingPanel from "@/features/teaching/components/teaching-panel";

export const metadata: Metadata = { title: "Seguimiento · SIGMA-FCEN" };

/** Teachers only: anyone else is sent home. The API enforces the role too (RN-009.1). */
export default function TeachingPage() {
  return (
    <RequireSession roles={["TEACHER"]}>
      {/* The term and course are read from the URL, which is only known in the browser. */}
      <Suspense fallback={null}>
        <TeachingPanel />
      </Suspense>
    </RequireSession>
  );
}
