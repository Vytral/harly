import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, gt } from "drizzle-orm";
import { cookies } from "next/headers";

import { db, securityReauthChallenges } from "@harly/db";

const COOKIE_NAME = "harly_reauth";

export async function issueReauthToken(input: { userId: string; workspaceId: string; purpose: string; minutes: number }) {
  const raw = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(raw).digest("hex");
  const expiresAt = new Date(Date.now() + input.minutes * 60_000);
  await db.insert(securityReauthChallenges).values({ userId: input.userId, workspaceId: input.workspaceId, purpose: input.purpose, tokenHash, expiresAt });
  return { raw, expiresAt, cookieName: COOKIE_NAME };
}
export async function requireRecentReauth(input: { userId: string; workspaceId: string; purpose: string }) {
  const raw = (await cookies()).get(COOKIE_NAME)?.value;
  if (!raw) return false;
  const tokenHash = createHash("sha256").update(raw).digest("hex");
  const [challenge] = await db.select({ id: securityReauthChallenges.id }).from(securityReauthChallenges).where(and(eq(securityReauthChallenges.userId, input.userId), eq(securityReauthChallenges.workspaceId, input.workspaceId), eq(securityReauthChallenges.purpose, input.purpose), eq(securityReauthChallenges.tokenHash, tokenHash), isNull(securityReauthChallenges.consumedAt), gt(securityReauthChallenges.expiresAt, new Date()))).limit(1);
  return Boolean(challenge);
}
