import "server-only";

import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

/**
 * Jitsi Meet config. No API and no secrets , the workspace's instance base URL
 * is the only setting. Meeting URLs are composed locally as `<base>/<room>`.
 */

export type WorkspaceJitsiStatus = {
  enabled: boolean;
  baseUrl: string | null;
};

export type JitsiConfig = {
  baseUrl: string;
};

export const DEFAULT_JITSI_BASE_URL = "https://meet.jit.si";

/** Public-safe Jitsi status for the settings UI. */
export async function getWorkspaceJitsiStatus(
  workspaceId: string,
): Promise<WorkspaceJitsiStatus> {
  const [row] = await db
    .select({
      jitsiEnabled: workspaceSettings.jitsiEnabled,
      jitsiBaseUrl: workspaceSettings.jitsiBaseUrl,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  return {
    enabled: Boolean(row?.jitsiEnabled),
    baseUrl: row?.jitsiBaseUrl ?? null,
  };
}

/** Resolve a usable Jitsi config, or null when disabled / unconfigured. */
export async function getWorkspaceJitsiConfig(
  workspaceId: string,
): Promise<JitsiConfig | null> {
  const status = await getWorkspaceJitsiStatus(workspaceId);
  if (!status.enabled || !status.baseUrl) return null;
  return { baseUrl: status.baseUrl };
}
