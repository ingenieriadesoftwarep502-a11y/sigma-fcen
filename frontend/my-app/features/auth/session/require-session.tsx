"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";

import { HOME_PATH, hasAnyRole, LOGIN_PATH, type RoleCode } from "@/lib/auth";

import SessionStatus from "../components/session-status";
import { useSession } from "./session-provider";

type RequireSessionProps = {
  /** When set, only users holding at least one of these roles may see the content. */
  roles?: readonly RoleCode[];
  children: ReactNode;
};

/**
 * Shows its content only to a signed-in user with a permitted role (T-01.15).
 * Without a session it sends the person to login, remembering where they were going;
 * with the wrong role it sends them home. The API enforces the same rules (RNF-SEC-004).
 */
export default function RequireSession({ roles, children }: RequireSessionProps) {
  const { session, reload } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const signedIn = session.status === "authenticated";
  const permitted = signedIn && (!roles || hasAnyRole(session.user, roles));

  useEffect(() => {
    if (session.status === "unauthenticated") {
      router.replace(`${LOGIN_PATH}?next=${encodeURIComponent(pathname)}`);
    } else if (signedIn && !permitted) {
      router.replace(HOME_PATH);
    }
  }, [session.status, signedIn, permitted, pathname, router]);

  if (session.status === "error") {
    return <SessionStatus message={session.message} onRetry={reload} />;
  }
  if (!permitted) {
    return <SessionStatus />;
  }
  return children;
}
