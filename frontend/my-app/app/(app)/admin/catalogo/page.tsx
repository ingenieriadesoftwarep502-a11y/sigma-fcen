import type { Metadata } from "next";
import { Suspense } from "react";

import RequireSession from "@/features/auth/session/require-session";
import CatalogAdmin from "@/features/catalog/components/catalog-admin";

export const metadata: Metadata = { title: "Catálogo · SIGMA-FCEN" };

/** Administrators only: anyone else is sent home. The API enforces the role too (RNF-SEC-004). */
export default function CatalogAdminPage() {
  return (
    <RequireSession roles={["ADMIN"]}>
      {/* The tab and its filters are read from the URL, which is only known in the browser. */}
      <Suspense fallback={null}>
        <CatalogAdmin />
      </Suspense>
    </RequireSession>
  );
}
