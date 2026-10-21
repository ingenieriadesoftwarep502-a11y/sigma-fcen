"use client";

import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

import { requestErrorMessage } from "@/lib/api-client";
import { getCurrentUser, LOGIN_PATH, logout, type User } from "@/lib/auth";

export type SessionState =
  | { status: "loading" }
  | { status: "authenticated"; user: User }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

type SessionContextValue = {
  session: SessionState;
  /** Asks the API again, e.g. after a network failure. */
  reload: () => void;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Who is signed in, as the API says (GET /users/me/). The token cookies are HttpOnly
 * (ADR-007), so asking the API is the only way to know. This drives the interface only:
 * every endpoint enforces authentication and roles on its own.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<SessionState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getCurrentUser(controller.signal).then(
      (user) => {
        if (controller.signal.aborted) return;
        setSession(user ? { status: "authenticated", user } : { status: "unauthenticated" });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setSession({ status: "error", message: requestErrorMessage(error) });
      },
    );
    return () => controller.abort();
  }, [attempt]);

  const reload = useCallback(() => {
    setSession({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  const signOut = useCallback(async () => {
    await logout();
    // Leaving the signed-in area unmounts this provider. Marking the session as
    // unauthenticated first would make RequireSession redirect with ?next= instead.
    router.replace(LOGIN_PATH);
  }, [router]);

  return (
    <SessionContext.Provider value={{ session, reload, signOut }}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used inside <SessionProvider>.");
  }
  return context;
}
