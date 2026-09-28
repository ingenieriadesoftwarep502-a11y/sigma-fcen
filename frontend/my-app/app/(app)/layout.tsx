import type { ReactNode } from "react";

import AppShell from "@/components/layouts/app-shell/app-shell";
import AccountMenu from "@/features/auth/components/account-menu";
import RequireSession from "@/features/auth/session/require-session";
import { SessionProvider } from "@/features/auth/session/session-provider";

/** Every route in this group needs a signed-in user; the API enforces it too. */
export default function SignedInLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AppShell account={<AccountMenu />}>
        <RequireSession>{children}</RequireSession>
      </AppShell>
    </SessionProvider>
  );
}
