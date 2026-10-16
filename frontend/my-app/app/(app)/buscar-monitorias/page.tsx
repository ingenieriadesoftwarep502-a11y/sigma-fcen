import type { Metadata } from "next";

import SlotSearch from "@/features/availability/components/slot-search";
import RequireSession from "@/features/auth/session/require-session";

export const metadata: Metadata = { title: "Buscar monitorías · SIGMA-FCEN" };

/**
 * Students only: anyone else is sent home. The search endpoint itself is open to every
 * signed-in person (HU-02); the role decides who sees it in the interface.
 */
export default function SlotSearchPage() {
  return (
    <RequireSession roles={["STUDENT"]}>
      <SlotSearch />
    </RequireSession>
  );
}
