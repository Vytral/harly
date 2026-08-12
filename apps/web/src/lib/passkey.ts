import "server-only";

import { eq, and, lt } from "drizzle-orm";
import { db, passkeys, passkeyChallenge } from "@harly/db";
import { getHarlyPublicOrigin } from "@/lib/public-origin";

const publicUrl = new URL(getHarlyPublicOrigin());
const RP_ID = publicUrl.hostname;
const RP_NAME = "Harly";
const ORIGIN = publicUrl.origin;

export { RP_ID, RP_NAME, ORIGIN };

export async function storeChallenge(
  userId: string,
  challenge: string,
  type: "registration" | "authentication",
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
  userId: string,
  type: "registration" | "authentication",
) {
  const [row] = await db
    .select()
    .from(passkeyChallenge)
    .where(
      and(
        eq(passkeyChallenge.userId, userId),
        eq(passkeyChallenge.type, type),
      ),
    )
    .limit(1);

  if (!row || row.expiresAt < new Date()) return null;

  await db.delete(passkeyChallenge).where(eq(passkeyChallenge.id, row.id));

  return row.challenge;
}

export async function getUserPasskeys(userId: string) {
  return db.select().from(passkeys).where(eq(passkeys.userId, userId));
}

export async function deletePasskey(id: string, userId: string) {
  await db
    .delete(passkeys)
    .where(and(eq(passkeys.id, id), eq(passkeys.userId, userId)));
}
