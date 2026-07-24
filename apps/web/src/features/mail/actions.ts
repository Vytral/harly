"use server";

import { db, workspaceSettings } from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { logAuditEvent } from "@/lib/audit-log";

/** Explicit, workspace-scoped rollout control. There is intentionally no global toggle. */
export async function setMailUnificationEnabledAction(enabled: boolean) {
  await requirePermission("integrations:manage");
  const { organization, user } = await getWorkspaceContext();
  await db.insert(workspaceSettings).values({ organizationId: organization.id, mailUnificationEnabled: enabled })
    .onConflictDoUpdate({ target: workspaceSettings.organizationId, set: { mailUnificationEnabled: enabled, updatedAt: new Date() } });
  await logAuditEvent({
    workspaceId: organization.id,
    actorId: user.id,
    actorEmail: user.email,
    action: enabled ? "mail.unification.enabled" : "mail.unification.disabled",
    resourceType: "workspace_settings",
    resourceId: organization.id,
    metadata: { enabled },
  });
  return { ok: true, enabled };
}
