"use client";

import HomeOverview from "@/features/auth/components/home-overview";
import { useSession } from "@/features/auth/session/session-provider";
import PinnedSubjectsPanel from "@/features/catalog/components/pinned-subjects-panel";
import { hasAnyRole } from "@/lib/auth";

import AdminDashboard from "./admin-dashboard";
import styles from "./home-screen.module.css";

/**
 * The first screen after signing in: the user dashboard for administrators, else the account,
 * and for students the subjects they keep at hand.
 */
export default function HomeScreen() {
  const { session } = useSession();
  if (session.status !== "authenticated") return null;

  if (hasAnyRole(session.user, ["ADMIN"])) {
    return <AdminDashboard firstName={session.user.first_name} />;
  }
  return (
    <div className={styles.home}>
      <HomeOverview />
      {hasAnyRole(session.user, ["STUDENT"]) && <PinnedSubjectsPanel userId={session.user.id} />}
    </div>
  );
}
