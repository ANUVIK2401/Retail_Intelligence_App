"use client";

import { createContext, useContext } from "react";
import type { Features } from "@/config/features";

export type SessionInfo = {
  actor: { id: string; name: string; title: string; roles: string[]; timezone: string };
  member: { name: string; email: string };
  /** Server-derived. Only controls whether the console link is shown; the
   *  admin API re-checks it and never trusts this value. */
  admin?: boolean;
  features: Features;
};

const SessionContext = createContext<SessionInfo | null>(null);

export const SessionProvider = SessionContext.Provider;

/** The signed-in executive, or null while /api/session is loading. */
export function useSession(): SessionInfo | null {
  return useContext(SessionContext);
}
