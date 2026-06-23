"use server";

import { headers } from "next/headers";
import { eq, desc, and } from "drizzle-orm";
import { db, auditLogs, passkeys, workspaceSettings } from "@harly/db";
import { auth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit-log";
import { getWorkspaceContext } from "@/features/workspaces/context";

async function getSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");
  return session;
}

export async function getAuditLogsAction(workspaceId: string) {
  await getSession();

  const rows = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.workspaceId, workspaceId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(200);

  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getUserPasskeysAction() {
  const session = await getSession();

  const rows = await db
    .select()
    .from(passkeys)
    .where(eq(passkeys.userId, session.user.id));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    deviceType: r.deviceType,
    backedUp: r.backedUp,
    createdAt: r.createdAt.toISOString(),
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
  }));
}

export async function deletePasskeyAction(passkeyId: string) {
  const session = await getSession();

  await db
    .delete(passkeys)
    .where(and(eq(passkeys.id, passkeyId), eq(passkeys.userId, session.user.id)));

  await logAuditEvent({
    actorId: session.user.id,
    actorEmail: session.user.email,
    action: "passkey.deleted",
    resourceType: "passkey",
    resourceId: passkeyId,
    severity: "warning",
  });
}

export async function renamePasskeyAction(passkeyId: string, name: string) {
  const { user } = await getSession();

  await db
    .update(passkeys)
    .set({ name: name.slice(0, 50) })
    .where(and(eq(passkeys.id, passkeyId), eq(passkeys.userId, user.id)));
}

export async function toggleForce2FAAction(
  require2fa: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { organization, roleKey, user } = await getWorkspaceContext();
    if (roleKey !== "owner") throw new Error("Only owners can change this setting.");

    await db
      .insert(workspaceSettings)
      .values({ organizationId: organization.id, require2fa })
      .onConflictDoUpdate({
        target: workspaceSettings.organizationId,
        set: { require2fa },
      });

    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      actorEmail: user.email,
      action: require2fa ? "settings.2fa_enforced" : "settings.2fa_unenforced",
      severity: "critical",
      metadata: { require2fa },
    });

    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed." };
  }
}
