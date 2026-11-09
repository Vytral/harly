import "server-only";

import { eq } from "drizzle-orm";

import { db, passkeys, user as userTable, workspaceSettings } from "@harly/db";

import type { WorkspaceContext } from "@/features/workspaces/context";
import { hasActorPermission } from "@/features/workspaces/permissions-server";
import type { Permission } from "@/features/workspaces/permissions";
import { mustSetUp2fa } from "@/lib/two-factor";
import { getTrustedClientIp, isEmailDomainAllowed, isIpAllowed } from "@/server/security/policy";

import { getWorkspaceMcpSettings, type WorkspaceMcpSettings } from "../settings";
import { clampScopes } from "./scopes";
import type { ValidAuthorizeRequest } from "./authorize";
import type { McpScope } from "../types";

export type ConsentBlock =
  | { reason: "mcp_disabled" }
  | { reason: "no_permission" }
  | { reason: "client_not_allowed" }
  | { reason: "ip_blocked" }
  | { reason: "domain_blocked" }
  | { reason: "needs_2fa" }
  | { reason: "needs_passkey" }
  | { reason: "must_change_password" };

export type ConsentGate =
  | { ok: true; settings: WorkspaceMcpSettings; grantedScopes: McpScope[]; ip: string | undefined }
  | { ok: false; block: ConsentBlock };

/**
 * Everything that must hold before the signed-in user may approve a client:
 * the workspace switch, the user's `mcp:use`, the client policy, and the same
 * session security policy the dashboard enforces in proxy.ts (IP allowlist,
 * allowed email domains, 2FA / passkey). The IP allowlist applies to this
 * consenting browser only, never to the agent's later API calls.
 */
export async function evaluateConsentGate(
  ctx: WorkspaceContext,
  request: ValidAuthorizeRequest,
  headers: Headers,
): Promise<ConsentGate> {
  const workspaceId = ctx.organization.id;
  const settings = await getWorkspaceMcpSettings(workspaceId);
  if (!settings.enabled) return { ok: false, block: { reason: "mcp_disabled" } };

  const [allowed, [ws], [userRow], [passkey]] = await Promise.all([
    hasActorPermission(workspaceId, ctx.user.id, "mcp:use" as Permission),
    db
      .select({
        require2fa: workspaceSettings.require2fa,
        ipAllowlist: workspaceSettings.securityIpAllowlist,
        allowedDomains: workspaceSettings.securityAllowedDomains,
        requirePasskey: workspaceSettings.securityRequirePasskey,
      })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, workspaceId))
      .limit(1),
    db
      .select({ twoFactorEnabled: userTable.twoFactorEnabled, mustChangePassword: userTable.mustChangePassword })
      .from(userTable)
      .where(eq(userTable.id, ctx.user.id))
      .limit(1),
    db.select({ id: passkeys.id }).from(passkeys).where(eq(passkeys.userId, ctx.user.id)).limit(1),
  ]);

  if (!allowed) return { ok: false, block: { reason: "no_permission" } };
  if (settings.clientMode === "known_only" && !request.client.known) {
    return { ok: false, block: { reason: "client_not_allowed" } };
  }

  const ip = getTrustedClientIp({ headers });
  const ipAllowlist = Array.isArray(ws?.ipAllowlist) ? (ws.ipAllowlist as string[]) : [];
  if (!isIpAllowed(ip, ipAllowlist)) return { ok: false, block: { reason: "ip_blocked" } };
  const domains = Array.isArray(ws?.allowedDomains) ? (ws.allowedDomains as string[]) : [];
  if (!isEmailDomainAllowed(ctx.user.email, domains)) return { ok: false, block: { reason: "domain_blocked" } };
  if (userRow?.mustChangePassword) return { ok: false, block: { reason: "must_change_password" } };
  if (
    mustSetUp2fa({
      workspaceRequires2fa: ws?.require2fa ?? false,
      userHas2fa: Boolean(userRow?.twoFactorEnabled) || Boolean(passkey),
      roleKey: ctx.roleKey,
    })
  ) {
    return { ok: false, block: { reason: "needs_2fa" } };
  }
  if (ws?.requirePasskey && !passkey) return { ok: false, block: { reason: "needs_passkey" } };

  const grantedScopes = clampScopes(request.scopes, settings.allowedScopes);
  if (grantedScopes.length === 0) return { ok: false, block: { reason: "no_permission" } };
  return { ok: true, settings, grantedScopes, ip };
}

export const CONSENT_BLOCK_MESSAGE_KEYS: Record<ConsentBlock["reason"], { title: string; body: string }> = {
  mcp_disabled: { title: "block.mcp_disabled.title", body: "block.mcp_disabled.body" },
  no_permission: { title: "block.no_permission.title", body: "block.no_permission.body" },
  client_not_allowed: { title: "block.client_not_allowed.title", body: "block.client_not_allowed.body" },
  ip_blocked: { title: "block.ip_blocked.title", body: "block.ip_blocked.body" },
  domain_blocked: { title: "block.domain_blocked.title", body: "block.domain_blocked.body" },
  needs_2fa: { title: "block.needs_2fa.title", body: "block.needs_2fa.body" },
  needs_passkey: { title: "block.needs_passkey.title", body: "block.needs_passkey.body" },
  must_change_password: { title: "block.must_change_password.title", body: "block.must_change_password.body" },
};
