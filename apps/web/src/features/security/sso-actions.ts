"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { createLogger } from "@/lib/logger";
import { logAuditEvent } from "@/lib/audit-log";

const log = createLogger("sso");

export type SSOProviderConfig = {
  id: string;
  providerId: string;
  issuer: string;
  domain: string;
  enabled: boolean;
  organizationId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SSORegisterInput = {
  providerId: string;
  issuer: string;
  domain: string;
  oidcConfig?: {
    clientId: string;
    clientSecret: string;
  };
  samlConfig?: {
    entryPoint: string;
    cert: string;
    callbackUrl: string;
    spMetadata?: {
      metadata?: string;
      entityID?: string;
      binding?: string;
      privateKey?: string;
      privateKeyPass?: string;
      isAssertionEncrypted?: boolean;
      encPrivateKey?: string;
      encPrivateKeyPass?: string;
    };
    audience?: string;
    wantAssertionsSigned?: boolean;
    signatureAlgorithm?: string;
    digestAlgorithm?: string;
    identifierFormat?: string;
  };
};

export type SSOActionResult = { ok: boolean; error?: string; providerId?: string };

/** Register a new SSO provider (OIDC or SAML). */
export async function registerSSOProviderAction(
  input: SSORegisterInput,
): Promise<SSOActionResult> {
  try {
    const { organization, user } = await requirePermission("security:manage");

    const headerList = await headers();

    // Build the registration body with proper typing
    const body: {
      providerId: string;
      issuer: string;
      domain: string;
      organizationId?: string;
      oidcConfig?: { clientId: string; clientSecret: string };
      samlConfig?: {
        issuer: string;
        entryPoint: string;
        cert: string;
        callbackUrl: string;
        spMetadata: { metadata?: string; entityID?: string; binding?: string };
        audience?: string;
        wantAssertionsSigned?: boolean;
        signatureAlgorithm?: string;
        digestAlgorithm?: string;
        identifierFormat?: string;
      };
    } = {
      providerId: input.providerId,
      issuer: input.issuer,
      domain: input.domain,
      organizationId: organization.id,
    };

    if (input.oidcConfig) {
      body.oidcConfig = {
        clientId: input.oidcConfig.clientId,
        clientSecret: input.oidcConfig.clientSecret,
      };
    }

    if (input.samlConfig) {
      body.samlConfig = {
        issuer: input.issuer,
        entryPoint: input.samlConfig.entryPoint,
        cert: input.samlConfig.cert,
        callbackUrl: input.samlConfig.callbackUrl,
        spMetadata: input.samlConfig.spMetadata ?? {},
        audience: input.samlConfig.audience,
        wantAssertionsSigned: input.samlConfig.wantAssertionsSigned ?? true,
        signatureAlgorithm: input.samlConfig.signatureAlgorithm ?? "sha256",
        digestAlgorithm: input.samlConfig.digestAlgorithm ?? "sha256",
        identifierFormat:
          input.samlConfig.identifierFormat ?? "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
      };
    }

    await auth.api.registerSSOProvider({
      body,
      headers: headerList,
    });

    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      actorEmail: user.email,
      action: "sso.provider_registered",
      severity: "warning",
      metadata: { providerId: input.providerId, issuer: input.issuer },
    });

    return { ok: true, providerId: input.providerId };
  } catch (error) {
    log.error(error, "registerSSOProviderAction failed");
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to register SSO provider.",
    };
  }
}

/** List all SSO providers for the current workspace. */
export async function listSSOProvidersAction(): Promise<SSOProviderConfig[]> {
  try {
    const { organization } = await getWorkspaceContext();
    const headerList = await headers();

    const result = await auth.api.listSSOProviders({
      headers: headerList,
    });

    // The API returns { providers: [...] }
    const data = result as { providers?: Array<Record<string, unknown>> };
    const providers = data?.providers ?? [];

    return providers
      .filter((p) => p.organizationId === organization.id)
      .map((p) => ({
        id: String(p.id ?? ""),
        providerId: String(p.providerId ?? ""),
        issuer: String(p.issuer ?? ""),
        domain: String(p.domain ?? ""),
        enabled: Boolean(p.enabled ?? true),
        organizationId: p.organizationId as string | null,
        createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt ?? ""),
        updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : String(p.updatedAt ?? ""),
      }));
  } catch (error) {
    log.error(error, "listSSOProvidersAction failed");
    return [];
  }
}

/** Delete an SSO provider. */
export async function deleteSSOProviderAction(
  providerId: string,
): Promise<SSOActionResult> {
  try {
    const { organization, user } = await requirePermission("security:manage");

    const headerList = await headers();

    await auth.api.deleteSSOProvider({
      body: { providerId },
      headers: headerList,
    });

    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      actorEmail: user.email,
      action: "sso.provider_deleted",
      severity: "critical",
      metadata: { providerId },
    });

    return { ok: true };
  } catch (error) {
    log.error(error, "deleteSSOProviderAction failed");
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to delete SSO provider.",
    };
  }
}
