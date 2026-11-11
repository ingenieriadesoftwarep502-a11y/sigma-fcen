import type { Metadata } from "next";
import { notFound } from "next/navigation";

import RequireSession from "@/features/auth/session/require-session";
import SubjectDetail from "@/features/catalog/components/subject-detail";

export const metadata: Metadata = { title: "Asignatura · SIGMA-FCEN" };

const ID_PATTERN = /^[1-9]\d*$/;

/**
 * One subject for students: its monitors and upcoming slots (the old /buscar-monitorias).
 * The API answers 404 for an inactive or unknown subject; the view says so.
 */
export default async function SubjectPage({ params }: PageProps<"/asignaturas/[id]">) {
  const { id } = await params;
  if (!ID_PATTERN.test(id)) return notFound();

  return (
    <RequireSession roles={["STUDENT"]}>
      <SubjectDetail subjectId={Number(id)} />
    </RequireSession>
  );
}
