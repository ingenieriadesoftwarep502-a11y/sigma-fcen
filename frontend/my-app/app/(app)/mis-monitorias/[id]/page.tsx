import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import RequireSession from "@/features/auth/session/require-session";
import AssignmentWorkspace from "@/features/availability/components/assignment-workspace";

export const metadata: Metadata = { title: "Disponibilidad · SIGMA-FCEN" };

const ID_PATTERN = /^[1-9]\d*$/;

/**
 * One of the monitor's assignments, where its availability is organized (T-03.16). The term
 * comes in `?periodo`; the view says so when the assignment is not the monitor's.
 */
export default async function AssignmentPage({ params }: PageProps<"/mis-monitorias/[id]">) {
  const { id } = await params;
  if (!ID_PATTERN.test(id)) return notFound();

  return (
    <RequireSession roles={["MONITOR"]}>
      {/* The term is read from the URL, which is only known in the browser. */}
      <Suspense fallback={null}>
        <AssignmentWorkspace assignmentId={Number(id)} />
      </Suspense>
    </RequireSession>
  );
}
