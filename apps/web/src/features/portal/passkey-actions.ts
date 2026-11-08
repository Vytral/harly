"use server";

import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";

import { candidatePortalPasskeys, db } from "@harly/db";
import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import { auditPortalEvent } from "@/lib/portal-credentials";

export async function deletePortalPasskeyAction(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const raw = (await cookies()).get(PORTAL_SESSION_COOKIE)?.value;
  const session = raw ? await resolvePortalSession(raw) : null;
  if (!session) return { ok: false, error: "Sign in again to continue." };
  const removed = await db
    .delete(candidatePortalPasskeys)
    .where(
      and(
        eq(candidatePortalPasskeys.id, id),
        eq(candidatePortalPasskeys.candidateId, session.candidateId),
      ),
    )
    .returning({ id: candidatePortalPasskeys.id });
  if (removed.length === 0) return { ok: false, error: "Passkey not found." };
  await auditPortalEvent({
    workspaceId: session.workspaceId,
    candidateId: session.candidateId,
    email: session.email,
    action: "portal.passkey_removed",
    severity: "warning",
  });
  return { ok: true };
}
