"use client";

import HomeOverview from "@/features/auth/components/home-overview";
import { useSession } from "@/features/auth/session/session-provider";
import { hasAnyRole } from "@/lib/auth";

import AdminDashboard from "./admin-dashboard";

/** The first screen after signing in: the user dashboard for administrators, else the account. */
export default function HomeScreen() {
  const { session } = useSession();
  if (session.status !== "authenticated") return null;

  if (hasAnyRole(session.user, ["ADMIN"])) {
    return <AdminDashboard firstName={session.user.first_name} />;
  }
  return <HomeOverview />;
}
