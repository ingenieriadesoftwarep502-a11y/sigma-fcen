import type { Metadata } from "next";
import { Suspense } from "react";

import RequireSession from "@/features/auth/session/require-session";
import MyCourses from "@/features/catalog/components/my-courses";

export const metadata: Metadata = { title: "Mis cursos · SIGMA-FCEN" };

/** Teachers only: anyone else is sent home. The API enforces the role too (RN-009.1). */
export default function MyCoursesPage() {
  return (
    <RequireSession roles={["TEACHER"]}>
      {/* The term is read from the URL, which is only known in the browser. */}
      <Suspense fallback={null}>
        <MyCourses />
      </Suspense>
    </RequireSession>
  );
}
