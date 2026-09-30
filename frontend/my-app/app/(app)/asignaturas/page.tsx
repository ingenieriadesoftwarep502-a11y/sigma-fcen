import type { Metadata } from "next";
import { Suspense } from "react";

import RequireSession from "@/features/auth/session/require-session";
import SubjectExplorer from "@/features/catalog/components/subject-explorer";

export const metadata: Metadata = { title: "Asignaturas · SIGMA-FCEN" };

/**
 * Students browse the whole catalog. Monitors and teachers only see their own subjects
 * (/mis-monitorias, /mis-cursos); a student who is also a monitor keeps both (ADR-008).
 */
export default function SubjectsPage() {
  return (
    <RequireSession roles={["STUDENT"]}>
      {/* The filters are read from the URL, which is only known in the browser. */}
      <Suspense fallback={null}>
        <SubjectExplorer />
      </Suspense>
    </RequireSession>
  );
}
