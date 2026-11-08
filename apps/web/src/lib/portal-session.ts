import "server-only";

import { cookies } from "next/headers";

import {
  PORTAL_SESSION_COOKIE,
  createPortalSession,
  deletePortalSession,
} from "@/lib/portal-auth";

export const PORTAL_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * Starts a portal session for a candidate who just proved their identity.
 * Any session the browser already held is destroyed first (rotation), so a
 * pre-login cookie can never become a post-login one.
 */
export async function establishPortalSession(
  candidateId: string,
  workspaceId: string,
  userAgent?: string,
): Promise<void> {
  const cookieStore = await cookies();
  const previous = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
  if (previous) await deletePortalSession(previous);
  const raw = await createPortalSession(candidateId, workspaceId, userAgent);
  cookieStore.set(PORTAL_SESSION_COOKIE, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PORTAL_SESSION_MAX_AGE_SECONDS,
  });
}
