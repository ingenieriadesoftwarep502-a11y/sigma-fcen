import type { Metadata } from "next";
import { Suspense } from "react";

import RequireSession from "@/features/auth/session/require-session";
import UserAdmin from "@/features/users/components/user-admin";

export const metadata: Metadata = { title: "Usuarios · SIGMA-FCEN" };

/** Administrators only: anyone else is sent home. The API enforces the role too (RNF-SEC-004). */
export default function UsersAdminPage() {
  return (
    <RequireSession roles={["ADMIN"]}>
      {/* The filters are read from the URL, which is only known in the browser. */}
      <Suspense fallback={null}>
        <UserAdmin />
      </Suspense>
    </RequireSession>
  );
}
