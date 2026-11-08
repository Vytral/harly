import "server-only";

import { and, eq, gt, isNull, lt } from "drizzle-orm";

import { candidatePortalChallenges, candidatePortalPasskeys, db } from "@harly/db";
import { getHarlyPublicOrigin } from "@/lib/public-origin";

const publicUrl = new URL(getHarlyPublicOrigin());
export const PORTAL_RP_ID = publicUrl.hostname;
export const PORTAL_RP_NAME = "Harly";
export const PORTAL_ORIGIN = publicUrl.origin;

export async function storePortalChallenge(
  workspaceId: string,
  candidateId: string | null,
  challenge: string,
  type: "registration" | "login",
) {
  await db
    .delete(candidatePortalChallenges)
    .where(lt(candidatePortalChallenges.expiresAt, new Date()));
  const [row] = await db
    .insert(candidatePortalChallenges)
    .values({
      workspaceId,
      candidateId,
      challenge,
      type,
      expiresAt: new Date(Date.now() + 5 * 60_000),
    })
    .returning({ id: candidatePortalChallenges.id });
  return row!.id;
}

/** Atomically consumes a challenge (single use, scoped to workspace/candidate/type). */
export async function consumePortalChallenge(
  id: string,
  workspaceId: string,
  candidateId: string | null,
  type: "registration" | "login",
): Promise<string | null> {
  const [row] = await db
    .delete(candidatePortalChallenges)
    .where(
      and(
        eq(candidatePortalChallenges.id, id),
        eq(candidatePortalChallenges.workspaceId, workspaceId),
        candidateId === null
          ? isNull(candidatePortalChallenges.candidateId)
          : eq(candidatePortalChallenges.candidateId, candidateId),
        eq(candidatePortalChallenges.type, type),
        gt(candidatePortalChallenges.expiresAt, new Date()),
      ),
    )
    .returning({ challenge: candidatePortalChallenges.challenge });
  return row?.challenge ?? null;
}

export async function listCandidatePasskeys(candidateId: string) {
  return db
    .select({
      id: candidatePortalPasskeys.id,
      name: candidatePortalPasskeys.name,
      createdAt: candidatePortalPasskeys.createdAt,
      lastUsedAt: candidatePortalPasskeys.lastUsedAt,
      backedUp: candidatePortalPasskeys.backedUp,
    })
    .from(candidatePortalPasskeys)
    .where(eq(candidatePortalPasskeys.candidateId, candidateId));
}

/** Same-origin check for state-changing JSON endpoints (CSRF defence beside SameSite=Lax). */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  return origin === PORTAL_ORIGIN;
}
