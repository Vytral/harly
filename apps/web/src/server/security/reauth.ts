import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, gt } from "drizzle-orm";
import { cookies } from "next/headers";

import { db, securityReauthChallenges, workspaceSettings } from "@harly/db";
import { getTranslations } from "@/i18n/server";

const COOKIE_NAME = "harly_reauth";

export async function issueReauthToken(input: { userId: string; workspaceId: string; purpose: string; minutes: number }) {
  const raw = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(raw).digest("hex");
  const expiresAt = new Date(Date.now() + input.minutes * 60_000);
  await db.insert(securityReauthChallenges).values({ userId: input.userId, workspaceId: input.workspaceId, purpose: input.purpose, tokenHash, expiresAt });
  return { raw, expiresAt, cookieName: COOKIE_NAME };
}

/**
 * Validates the caller's reauth cookie and, by default, consumes the token in
 * the same statement so one passkey assertion authorises exactly one sensitive
 * action (a stolen or replayed cookie is worthless afterwards). The UPDATE is
 * atomic, so two concurrent requests cannot both spend the same token.
 */
export async function requireRecentReauth(input: { userId: string; workspaceId: string; purpose: string; consume?: boolean }) {
  const raw = (await cookies()).get(COOKIE_NAME)?.value;
  if (!raw) return false;
  const tokenHash = createHash("sha256").update(raw).digest("hex");
  const matches = and(
    eq(securityReauthChallenges.userId, input.userId),
    eq(securityReauthChallenges.workspaceId, input.workspaceId),
    eq(securityReauthChallenges.purpose, input.purpose),
    eq(securityReauthChallenges.tokenHash, tokenHash),
    isNull(securityReauthChallenges.consumedAt),
    gt(securityReauthChallenges.expiresAt, new Date()),
  );
  if (input.consume === false) {
    const [challenge] = await db.select({ id: securityReauthChallenges.id }).from(securityReauthChallenges).where(matches).limit(1);
    return Boolean(challenge);
  }
  const consumed = await db
    .update(securityReauthChallenges)
    .set({ consumedAt: new Date() })
    .where(matches)
    .returning({ id: securityReauthChallenges.id });
  return consumed.length > 0;
}

/**
 * Throws a user-facing error unless the caller just confirmed their identity
 * with a passkey (see `ensureSensitiveActionReauth` on the client). Spends the
 * reauth token. Skipped only when the workspace disabled reauthentication.
 */
export async function requireSensitiveReauth(userId: string, workspaceId: string) {
  const t = await getTranslations("server.security.actions");
  const [settings] = await db.select({ minutes: workspaceSettings.securityReauthMinutes }).from(workspaceSettings).where(eq(workspaceSettings.organizationId, workspaceId)).limit(1);
  if ((settings?.minutes ?? 15) > 0 && !(await requireRecentReauth({ userId, workspaceId, purpose: "sensitive_action" }))) {
    throw new Error(t("reauthRequired"));
  }
}
