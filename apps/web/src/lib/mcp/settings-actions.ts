"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertNotDemo } from "@/features/demo/assert-not-demo";
import { getRolePermissions, requirePermission } from "@/features/workspaces/permissions-server";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { roleIsAllPowerful } from "@/features/workspaces/permissions";
import { logAuditEvent } from "@/lib/audit-log";
import { createLogger } from "@/lib/logger";

import { listMcpGrants, revokeMcpGrant } from "./oauth/grants";
import { updateWorkspaceMcpSettings } from "./settings";

const log = createLogger("mcp-settings");

export type McpSettingsActionResult = { ok: boolean; error?: string };

const SETTINGS_PATH = "/settings/ai-agents";

const settingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    clientMode: z.enum(["any", "known_only"]).optional(),
    allowDcr: z.boolean().optional(),
  })
  .strict();

function failure(error: unknown, fallback: string): McpSettingsActionResult {
  log.error({ err: error instanceof Error ? error.message.slice(0, 200) : "unknown" }, fallback);
  return { ok: false, error: error instanceof Error && error.message.length < 160 ? error.message : fallback };
}

/** Workspace switch, client mode and dynamic registration. Needs `mcp:manage`. */
export async function updateMcpSettingsAction(
  input: z.input<typeof settingsSchema>,
): Promise<McpSettingsActionResult> {
  assertNotDemo();
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Those settings are not valid." };
  try {
    const { organization, user } = await requirePermission("mcp:manage");
    await updateWorkspaceMcpSettings(organization.id, parsed.data, user.id);
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      actorEmail: user.email,
      action: "mcp.settings.updated",
      resourceType: "mcp_settings",
      resourceId: organization.id,
      severity: parsed.data.enabled === false ? "warning" : "info",
      metadata: { ...parsed.data },
    });
    revalidatePath(SETTINGS_PATH);
    return { ok: true };
  } catch (error) {
    return failure(error, "Could not save the AI agent settings.");
  }
}

/**
 * Revoke one connection. Everyone may revoke their own; revoking someone
 * else's needs `mcp:manage`. The grant is looked up inside the caller's
 * workspace, so an id from another workspace is simply not found.
 */
export async function revokeMcpConnectionAction(grantId: string): Promise<McpSettingsActionResult> {
  assertNotDemo();
  if (typeof grantId !== "string" || !/^[0-9a-f-]{36}$/i.test(grantId)) {
    return { ok: false, error: "That connection no longer exists." };
  }
  try {
    const { organization, user, roleKey } = await getWorkspaceContext();
    const permissions = await getRolePermissions(organization.id, roleKey);
    const canManage = roleIsAllPowerful(roleKey) || permissions.includes("mcp:manage");
    const canUse = canManage || permissions.includes("mcp:use");
    if (!canUse) return { ok: false, error: "You do not have permission to do this." };

    const visible = await listMcpGrants({
      workspaceId: organization.id,
      userId: canManage ? undefined : user.id,
    });
    if (!visible.some((grant) => grant.id === grantId)) {
      return { ok: false, error: "That connection no longer exists." };
    }
    const revoked = await revokeMcpGrant(grantId, {
      workspaceId: organization.id,
      revokedBy: user.id,
      reason: "revoked_in_settings",
    });
    if (!revoked) return { ok: false, error: "That connection was already revoked." };
    revalidatePath(SETTINGS_PATH);
    return { ok: true };
  } catch (error) {
    return failure(error, "Could not revoke the connection.");
  }
}
