import "server-only";

import { eq } from "drizzle-orm";

import { isDemoMode } from "@harly/config";
import { db, organization, workspaceMcpSettings } from "@harly/db";

import { MCP_SCOPES, type McpScope } from "./types";

export type McpClientMode = "any" | "known_only";

export type WorkspaceMcpSettings = {
  workspaceId: string;
  enabled: boolean;
  clientMode: McpClientMode;
  allowDcr: boolean;
  /** Scopes a client may be granted in this workspace. */
  allowedScopes: McpScope[];
};

const DEFAULTS = { enabled: true, clientMode: "any" as McpClientMode, allowDcr: true };

/** Pure: turn a stored row (or nothing) into effective settings. */
export function resolveMcpSettings(
  workspaceId: string,
  row?: {
    enabled: boolean;
    clientMode: string;
    allowDcr: boolean;
    maxScopes: string[] | null;
  } | null,
): WorkspaceMcpSettings {
  const maxScopes = row?.maxScopes ?? null;
  return {
    workspaceId,
    enabled: row?.enabled ?? DEFAULTS.enabled,
    clientMode: row?.clientMode === "known_only" ? "known_only" : DEFAULTS.clientMode,
    allowDcr: row?.allowDcr ?? DEFAULTS.allowDcr,
    allowedScopes: maxScopes
      ? MCP_SCOPES.filter((scope) => maxScopes.includes(scope))
      : [...MCP_SCOPES],
  };
}

export async function getWorkspaceMcpSettings(workspaceId: string): Promise<WorkspaceMcpSettings> {
  const [row] = await db
    .select({
      enabled: workspaceMcpSettings.enabled,
      clientMode: workspaceMcpSettings.clientMode,
      allowDcr: workspaceMcpSettings.allowDcr,
      maxScopes: workspaceMcpSettings.maxScopes,
    })
    .from(workspaceMcpSettings)
    .where(eq(workspaceMcpSettings.workspaceId, workspaceId))
    .limit(1);
  return resolveMcpSettings(workspaceId, row);
}

/** MCP is on by default; an owner/admin can switch it off per workspace. */
export async function isMcpEnabledForWorkspace(workspaceId: string): Promise<boolean> {
  // The public demo hands out throwaway sandboxes; agents never connect to it.
  if (isDemoMode()) return false;
  return (await getWorkspaceMcpSettings(workspaceId)).enabled;
}

export type McpSettingsUpdate = Partial<{
  enabled: boolean;
  clientMode: McpClientMode;
  allowDcr: boolean;
  /** null = no cap (every scope). */
  maxScopes: McpScope[] | null;
}>;

/** Upsert policy. Callers (settings UI) must enforce `mcp:manage` first. */
export async function updateWorkspaceMcpSettings(
  workspaceId: string,
  update: McpSettingsUpdate,
  updatedBy: string,
): Promise<WorkspaceMcpSettings> {
  const values = {
    ...(update.enabled !== undefined && { enabled: update.enabled }),
    ...(update.clientMode !== undefined && { clientMode: update.clientMode }),
    ...(update.allowDcr !== undefined && { allowDcr: update.allowDcr }),
    ...(update.maxScopes !== undefined && { maxScopes: update.maxScopes }),
    updatedBy,
  };
  await db
    .insert(workspaceMcpSettings)
    .values({ workspaceId, ...values })
    .onConflictDoUpdate({ target: workspaceMcpSettings.workspaceId, set: values });
  return getWorkspaceMcpSettings(workspaceId);
}

/**
 * Pre-consent endpoints (discovery, registration) run before any user is known.
 * Harly instances host one workspace, so those use that workspace's policy;
 * the consent step re-checks against the signed-in user's actual workspace.
 */
export async function getInstanceMcpSettings(): Promise<WorkspaceMcpSettings> {
  const [org] = await db
    .select({ id: organization.id })
    .from(organization)
    .orderBy(organization.createdAt)
    .limit(1);
  return org ? getWorkspaceMcpSettings(org.id) : resolveMcpSettings("", null);
}
