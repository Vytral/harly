import "server-only";

import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";
import { getWorkspaceEmailSender } from "@/lib/email";
import {
  getPortalGitHubCredentials,
  getPortalGoogleCredentials,
  getPortalLinkedInCredentials,
} from "@/lib/portal-auth";
import {
  parsePortalAuthConfig,
  resolvePortalAuthMethods,
  type PortalAuthConfig,
  type PortalAuthMethods,
  type PortalAuthRequirements,
} from "@/lib/portal-auth-methods-core";

export * from "@/lib/portal-auth-methods-core";

export async function getPortalAuthRequirements(
  workspaceId: string,
): Promise<PortalAuthRequirements> {
  const [sender, google, github, linkedin] = await Promise.all([
    getWorkspaceEmailSender(workspaceId).catch(() => null),
    getPortalGoogleCredentials(workspaceId),
    getPortalGitHubCredentials(workspaceId),
    getPortalLinkedInCredentials(workspaceId),
  ]);
  return {
    emailReady: Boolean(sender),
    google: Boolean(google),
    github: Boolean(github),
    linkedin: Boolean(linkedin),
  };
}

export async function getStoredPortalAuthConfig(
  workspaceId: string,
): Promise<PortalAuthConfig> {
  const [row] = await db
    .select({ methods: workspaceSettings.portalAuthMethods })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);
  return parsePortalAuthConfig(row?.methods);
}

/** Single source of truth for what the portal offers (and accepts). */
export async function getPortalAuthMethods(
  workspaceId: string,
): Promise<PortalAuthMethods> {
  const [config, req] = await Promise.all([
    getStoredPortalAuthConfig(workspaceId),
    getPortalAuthRequirements(workspaceId),
  ]);
  return resolvePortalAuthMethods(config, req);
}
