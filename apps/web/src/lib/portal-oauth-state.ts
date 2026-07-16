import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";

export const PORTAL_OAUTH_STATE_COOKIE = "portal_oauth_state";

export function createPortalOAuthState(next: string) {
  const safeNext = next.startsWith("/portal/") ? next : "/portal/dashboard";
  return `${randomBytes(32).toString("base64url")}.${Buffer.from(safeNext).toString("base64url")}`;
}

export function verifyPortalOAuthState(expected: string | undefined, actual: string) {
  if (!expected || expected.length !== actual.length) return null;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) return null;
  const [, encodedNext] = actual.split(".");
  if (!encodedNext) return null;
  try {
    const next = Buffer.from(encodedNext, "base64url").toString();
    return next.startsWith("/portal/") ? next : null;
  } catch {
    return null;
  }
}
