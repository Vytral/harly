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

export const CONSENT_BLOCK_COPY: Record<ConsentBlock["reason"], { title: string; body: string }> = {
  mcp_disabled: {
    title: "AI connections are turned off",
    body: "An owner or admin has disabled AI client connections for this workspace.",
  },
  no_permission: {
    title: "You can't connect AI apps",
    body: "Your role doesn't include permission to connect AI apps. Ask a workspace admin to grant it.",
  },
  client_not_allowed: {
    title: "This app isn't allowed",
    body: "This workspace only allows connections from recognised AI apps, and this one isn't on the list.",
  },
  ip_blocked: {
    title: "Access is restricted",
    body: "Your current network isn't on this workspace's IP allowlist. Connect from an approved network.",
  },
  domain_blocked: {
    title: "Email domain not allowed",
    body: "Your email domain isn't allowed for this workspace.",
  },
  needs_2fa: {
    title: "Set up two-factor authentication first",
    body: "This workspace requires two-factor authentication before you can connect AI apps.",
  },
  needs_passkey: {
    title: "Add a passkey first",
    body: "This workspace requires a passkey before you can connect AI apps.",
  },
  must_change_password: {
    title: "Change your password first",
    body: "You need to replace your temporary password before connecting AI apps.",
  },
};
