import "server-only";

import { getWorkspaceContext } from "@/features/workspaces/context";
import { INTEGRATIONS, getIntegrationStatuses, isConnected } from "@/features/workspaces/integrations-registry";
import { getActorPermissions } from "@/features/workspaces/permissions-server";
import { roleLabel } from "@/features/workspaces/permissions";
import { createLogger } from "@/lib/logger";

import type { McpActor } from "../actor";

const log = createLogger("mcp");

export type WorkspaceSummary = {
  workspace: { id: string; name: string; url: string };
  you: { id: string; name: string; role: string; roleKey: string };
  permissions: string[];
  connection: { client: string; scopes: string[] };
  integrations: { name: string; connected: boolean }[];
};

/**
 * "Who am I acting as": identity, role, permissions, granted scopes and which
 * integrations are connected. Runs inside the actor scope. Used by the
 * `workspace_info` tool and the `harly://workspace` resource.
 */
export async function buildWorkspaceSummary(input: { actor: McpActor; appOrigin: string }): Promise<WorkspaceSummary> {
  const { actor, appOrigin } = input;
  const context = await getWorkspaceContext();
  const permissions = await getActorPermissions(actor.workspaceId, actor.userId);

  let integrations: WorkspaceSummary["integrations"] = [];
  try {
    const statuses = await getIntegrationStatuses(actor.workspaceId);
    integrations = INTEGRATIONS.map((integration) => ({
      name: integration.name,
      connected: isConnected(integration.slug, statuses),
    })).filter((item) => item.connected);
  } catch (error) {
    // The summary is still useful without the integration list.
    log.warn({ requestId: actor.requestId, err: error instanceof Error ? error.message.slice(0, 200) : "unknown" }, "mcp integration summary failed");
  }

  return {
    workspace: { id: context.organization.id, name: context.organization.name, url: appOrigin },
    you: {
      id: context.user.id,
      name: context.user.name,
      role: roleLabel(context.roleKey),
      roleKey: context.roleKey,
    },
    permissions: [...permissions].sort(),
    connection: { client: actor.clientName, scopes: [...actor.scopes].sort() },
    integrations,
  };
}
