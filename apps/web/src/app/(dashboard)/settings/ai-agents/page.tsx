import { notFound } from "next/navigation";

import { isDemoMode } from "@harly/config";
import { AiAgentsSettings } from "@/features/mcp/AiAgentsSettings";
import { getWorkspaceContext } from "@/features/workspaces/context";
import {
  getRolePermissions,
  requireAnyPagePermission,
} from "@/features/workspaces/permissions-server";
import { roleIsAllPowerful } from "@/features/workspaces/permissions";
import { listMcpGrants } from "@/lib/mcp/oauth/grants";
import { mcpResource } from "@/lib/mcp/oauth/config";
import { getWorkspaceMcpSettings } from "@/lib/mcp/settings";

export const dynamic = "force-dynamic";

export default async function AiAgentsSettingsPage() {
  if (isDemoMode()) notFound();
  await requireAnyPagePermission(["mcp:use", "mcp:manage"]);
  const { organization, user, roleKey } = await getWorkspaceContext();
  const permissions = await getRolePermissions(organization.id, roleKey);
  const canManage = roleIsAllPowerful(roleKey) || permissions.includes("mcp:manage");
  const canUse = canManage || permissions.includes("mcp:use");

  const [settings, grants] = await Promise.all([
    getWorkspaceMcpSettings(organization.id),
    listMcpGrants({ workspaceId: organization.id, userId: canManage ? undefined : user.id }),
  ]);

  return (
    <AiAgentsSettings
      serverUrl={mcpResource()}
      workspaceName={organization.name}
      canManage={canManage}
      canUse={canUse}
      settings={{
        enabled: settings.enabled,
        clientMode: settings.clientMode,
        allowDcr: settings.allowDcr,
      }}
      currentUserId={user.id}
      connections={grants.map((grant) => ({
        id: grant.id,
        clientName: grant.clientName,
        clientHost: grant.clientHost,
        userId: grant.userId,
        userName: grant.userName,
        userEmail: grant.userEmail,
        scopes: grant.scopes,
        createdAt: grant.createdAt.toISOString(),
        lastUsedAt: grant.lastUsedAt ? grant.lastUsedAt.toISOString() : null,
      }))}
    />
  );
}
