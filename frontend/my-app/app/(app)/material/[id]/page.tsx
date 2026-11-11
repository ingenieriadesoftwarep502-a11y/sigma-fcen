import type { Metadata } from "next";
import { notFound } from "next/navigation";

import RequireSession from "@/features/auth/session/require-session";
import MaterialWorkspace from "@/features/materials/components/material-workspace";

export const metadata: Metadata = { title: "Material · SIGMA-FCEN" };

const ID_PATTERN = /^[1-9]\d*$/;

/**
 * The repository of one subject, where its monitor or teacher uploads documents and adds
 * videos. The view says so when the person may not publish there.
 */
export default async function MaterialSubjectPage({ params }: PageProps<"/material/[id]">) {
  const { id } = await params;
  if (!ID_PATTERN.test(id)) return notFound();

  return (
    <RequireSession roles={["MONITOR", "TEACHER"]}>
      <MaterialWorkspace subjectId={Number(id)} />
    </RequireSession>
  );
}
