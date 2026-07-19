import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";

export const PORTAL_OAUTH_STATE_COOKIE = "portal_oauth_state";

export type PortalOAuthState = {
  next: string;
  workspaceId: string;
};

export function createPortalOAuthState(next: string, workspaceId: string) {
  const safeNext = next.startsWith("/portal/") ? next : "/portal/dashboard";
  return `${randomBytes(32).toString("base64url")}.${Buffer.from(
    JSON.stringify({ next: safeNext, workspaceId }),
  ).toString("base64url")}`;
}

export function verifyPortalOAuthState(
  expected: string | undefined,
  actual: string,
): PortalOAuthState | null {
  if (!expected || expected.length !== actual.length) return null;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) return null;
  const [, encodedPayload] = actual.split(".");
  if (!encodedPayload) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString(),
    ) as Partial<PortalOAuthState>;
    if (
      typeof payload.workspaceId !== "string" ||
      !payload.workspaceId ||
      typeof payload.next !== "string" ||
      !payload.next.startsWith("/portal/")
    ) {
      return null;
    }
    return { next: payload.next, workspaceId: payload.workspaceId };
  } catch {
    return null;
  }
}
