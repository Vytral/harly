import "server-only";

import { eq } from "drizzle-orm";

import { db, memberSenderIdentity } from "@harly/db";
import { generateLocalPart } from "@/lib/email/sender-identity";

type DbOrTx = Pick<typeof db, "select" | "insert">;

const MAX_SUFFIX_ATTEMPTS = 50;

/**
 * Provision a virtual sender identity for a newly-added member. Idempotent ,
 * a no-op if one already exists for this member. Runs unconditionally
 * (regardless of whether the workspace has a custom domain configured yet):
 * cheap, and means the identity is already there the moment a self-hoster
 * configures one later. Never throws , a name collision that exhausts the
 * suffix budget just leaves the member without an identity, which safely
 * falls back to the shared workspace sender until an admin sets one by hand.
 */
export async function provisionMemberSenderIdentity(
  dbOrTx: DbOrTx,
  input: { organizationId: string; memberId: string; userId: string; name: string },
): Promise<void> {
  const [existing] = await dbOrTx
    .select({ id: memberSenderIdentity.id })
    .from(memberSenderIdentity)
    .where(eq(memberSenderIdentity.memberId, input.memberId))
    .limit(1);

  if (existing) return;

  const base = generateLocalPart(input.name);

  for (let attempt = 0; attempt < MAX_SUFFIX_ATTEMPTS; attempt++) {
    const localPart = attempt === 0 ? base : `${base}${attempt + 1}`;

    try {
      const [inserted] = await dbOrTx
        .insert(memberSenderIdentity)
        .values({
          organizationId: input.organizationId,
          memberId: input.memberId,
          userId: input.userId,
          localPart,
        })
        .onConflictDoNothing({
          target: [memberSenderIdentity.organizationId, memberSenderIdentity.localPart],
        })
        .returning({ id: memberSenderIdentity.id });

      if (inserted) return;
    } catch (error) {
      // Concurrent provisioning attempt for the same member already won ,
      // the member-level unique index rejected this insert outright (not
      // suppressible via the org+localPart onConflict target above).
      if (
        error instanceof Error &&
        "code" in error &&
        (error as { code?: string }).code === "23505"
      ) {
        return;
      }
      throw error;
    }
  }
}
