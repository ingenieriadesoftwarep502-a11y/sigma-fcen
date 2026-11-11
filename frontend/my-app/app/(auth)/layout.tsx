import type { ReactNode } from "react";

import AuthShell from "@/components/layouts/auth-shell/auth-shell";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
