import type { Metadata } from "next";

import RequireSession from "@/features/auth/session/require-session";
import MaterialSubjects from "@/features/materials/components/material-subjects";

export const metadata: Metadata = { title: "Material · SIGMA-FCEN" };

/** Monitors and teachers pick the subject they add material to (FASE-07). */
export default function MaterialPage() {
  return (
    <RequireSession roles={["MONITOR", "TEACHER"]}>
      <MaterialSubjects />
    </RequireSession>
  );
}
