import "server-only";

import { eq, and, gt, isNull, lt } from "drizzle-orm";
import { db, passkeys, passkeyChallenge } from "@harly/db";
import { getHarlyPublicOrigin } from "@/lib/public-origin";

const publicUrl = new URL(getHarlyPublicOrigin());
const RP_ID = publicUrl.hostname;
const RP_NAME = "Harly";
const ORIGIN = publicUrl.origin;

export { RP_ID, RP_NAME, ORIGIN };

export async function storeChallenge(
  userId: string | null,
  challenge: string,
  type: "login" | "registration" | "authentication",
) {
  // Purge stale challenges first.
  await db
    .delete(passkeyChallenge)
    .where(lt(passkeyChallenge.expiresAt, new Date()));

  const [row] = await db
    .insert(passkeyChallenge)
    .values({
      userId,
      challenge,
      type,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    })
    .returning();

  return row;
}

export async function consumeChallenge(
  challengeId: string,
  userId: string | null,
  type: "login" | "registration" | "authentication",
) {
  const scope = userId === null
    ? isNull(passkeyChallenge.userId)
    : eq(passkeyChallenge.userId, userId);
  const [row] = await db
    .delete(passkeyChallenge)
    .where(
      and(
        eq(passkeyChallenge.id, challengeId),
        scope,
        eq(passkeyChallenge.type, type),
        gt(passkeyChallenge.expiresAt, new Date()),
      ),
    )
    .returning({ challenge: passkeyChallenge.challenge });

  return row?.challenge ?? null;
}

export async function getUserPasskeys(userId: string) {
  return db.select().from(passkeys).where(eq(passkeys.userId, userId));
}

export async function deletePasskey(id: string, userId: string) {
  await db
    .delete(passkeys)
    .where(and(eq(passkeys.id, id), eq(passkeys.userId, userId)));
}
