"use server";

import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { getTranslations } from "@/i18n/server";

import { candidatePortalPasskeys, db } from "@harly/db";
import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import { auditPortalEvent } from "@/lib/portal-credentials";

export async function deletePortalPasskeyAction(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const t = await getTranslations("server.portal.passkeys");
  const raw = (await cookies()).get(PORTAL_SESSION_COOKIE)?.value;
  const session = raw ? await resolvePortalSession(raw) : null;
  if (!session) return { ok: false, error: t("signInAgain") };
  const removed = await db
    .delete(candidatePortalPasskeys)
    .where(
      and(
        eq(candidatePortalPasskeys.id, id),
        eq(candidatePortalPasskeys.candidateId, session.candidateId),
      ),
    )
    .returning({ id: candidatePortalPasskeys.id });
  if (removed.length === 0) return { ok: false, error: t("notFound") };
  await auditPortalEvent({
    workspaceId: session.workspaceId,
    candidateId: session.candidateId,
    email: session.email,
    action: "portal.passkey_removed",
    severity: "warning",
  });
  return { ok: true };
}
