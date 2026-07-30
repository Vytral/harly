"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { createLogger } from "@/lib/logger";
import { logAuditEvent } from "@/lib/audit-log";
import { loadHarlyConfig } from "@harly/config";
import { validateSamlRegistration } from "@harly/auth/saml-config";

const log = createLogger("sso");

export type SSOProviderConfig = {
  id: string;
  providerId: string;
  type: "oidc" | "saml";
  issuer: string;
  domain: string;
  enabled: boolean;
  organizationId: string | null;
  domainVerified: boolean;
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
    entryPoint?: string;
    cert?: string;
    callbackUrl: string;
    metadata?: string;
    privateKey?: string;
    idpMetadata?: {
      metadata?: string;
      entityID?: string;
      cert?: string;
      singleSignOnService?: Array<{ Binding: string; Location: string }>;
    };
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
    authnRequestsSigned?: boolean;
  };
};

export type SSOActionResult = { ok: boolean; error?: string; providerId?: string };

type DomainVerificationApi = {
  requestDomainVerification(input: { body: { providerId: string }; headers: Headers }): Promise<{
    domainVerificationToken?: string;
  }>;
  verifyDomain(input: { body: { providerId: string }; headers: Headers }): Promise<unknown>;
};

/** Register a new SSO provider (OIDC or SAML). */
export async function registerSSOProviderAction(
  input: SSORegisterInput,
): Promise<SSOActionResult> {
  try {
    const { organization, user, roleKey } = await requirePermission("security:manage");
    if (roleKey !== "owner") {
      return { ok: false, error: "Only the workspace owner can configure enterprise SSO." };
    }

    const headerList = await headers();
    const config = loadHarlyConfig();

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
        privateKey?: string;
        idpMetadata?: {
          metadata?: string;
          entityID?: string;
          cert?: string;
          singleSignOnService?: Array<{ Binding: string; Location: string }>;
        };
        spMetadata: { metadata?: string; entityID?: string; binding?: string };
        audience?: string;
        wantAssertionsSigned?: boolean;
        signatureAlgorithm?: string;
        digestAlgorithm?: string;
        identifierFormat?: string;
        authnRequestsSigned?: boolean;
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
      const saml = validateSamlRegistration({
        providerId: input.providerId,
        issuer: input.issuer,
        domain: input.domain,
        entryPoint: input.samlConfig.entryPoint ?? "",
        cert: input.samlConfig.cert ?? "",
        appUrl: config.HARLY_URL,
        allowHttp: process.env.NODE_ENV !== "production",
        metadata: input.samlConfig.metadata,
        privateKey: input.samlConfig.privateKey,
        authnRequestsSigned: input.samlConfig.authnRequestsSigned,
      });
      body.samlConfig = {
        issuer: saml.issuer,
        entryPoint: saml.entryPoint,
        cert: saml.cert,
        callbackUrl: saml.callbackUrl,
        idpMetadata: saml.idpMetadata ?? input.samlConfig.idpMetadata,
        privateKey: saml.privateKey,
        spMetadata: saml.spMetadata,
        audience: saml.audience,
        wantAssertionsSigned: input.samlConfig.wantAssertionsSigned ?? true,
        signatureAlgorithm: input.samlConfig.signatureAlgorithm ?? "sha256",
        digestAlgorithm: input.samlConfig.digestAlgorithm ?? "sha256",
        identifierFormat:
          input.samlConfig.identifierFormat ?? "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
        authnRequestsSigned: saml.authnRequestsSigned,
      };
      body.issuer = saml.issuer;
      body.domain = saml.domain;
      body.providerId = saml.providerId;
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

    return { ok: true, providerId: input.providerId.trim().toLowerCase() };
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
        type: p.type === "saml" ? "saml" : "oidc",
        issuer: String(p.issuer ?? ""),
        domain: String(p.domain ?? ""),
        enabled: Boolean(p.enabled ?? true),
        organizationId: p.organizationId as string | null,
        domainVerified: Boolean(p.domainVerified ?? false),
        createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt ?? ""),
        updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : String(p.updatedAt ?? ""),
      }));
  } catch (error) {
    log.error(error, "listSSOProvidersAction failed");
    return [];
  }
}

/** Update an existing SSO provider without creating a duplicate provider row. */
export async function updateSSOProviderAction(
  input: SSORegisterInput,
): Promise<SSOActionResult> {
  try {
    const { organization, user, roleKey } = await requirePermission("security:manage");
    if (roleKey !== "owner") {
      return { ok: false, error: "Only the workspace owner can manage enterprise SSO." };
    }

    const visibleProviders = await listSSOProvidersAction();
    const existing = visibleProviders.find(
      (provider) => provider.providerId === input.providerId && provider.organizationId === organization.id,
    );
    if (!existing) return { ok: false, error: "SSO provider not found." };

    const headerList = await headers();
    const config = loadHarlyConfig();
    const body: {
      providerId: string;
      issuer: string;
      domain: string;
      oidcConfig?: { clientId?: string; clientSecret?: string };
      samlConfig?: {
        issuer: string;
        entryPoint: string;
        cert: string;
        callbackUrl: string;
        privateKey?: string;
        spMetadata: { entityID: string };
        audience: string;
        wantAssertionsSigned: boolean;
        signatureAlgorithm: string;
        digestAlgorithm: string;
        identifierFormat: string;
        authnRequestsSigned: boolean;
      };
    } = {
      providerId: existing.providerId,
      issuer: input.issuer.trim(),
      domain: input.domain.trim(),
    };

    if (input.samlConfig) {
      const saml = validateSamlRegistration({
        providerId: existing.providerId,
        issuer: input.issuer,
        domain: input.domain,
        entryPoint: input.samlConfig.entryPoint ?? "",
        cert: input.samlConfig.cert ?? "",
        appUrl: config.HARLY_URL,
        allowHttp: process.env.NODE_ENV !== "production",
        metadata: input.samlConfig.metadata,
        privateKey: input.samlConfig.privateKey,
        authnRequestsSigned: input.samlConfig.authnRequestsSigned,
      });
      body.samlConfig = {
        issuer: saml.issuer,
        entryPoint: saml.entryPoint,
        cert: saml.cert,
        callbackUrl: saml.callbackUrl,
        spMetadata: saml.spMetadata,
        audience: saml.audience,
        privateKey: saml.privateKey,
        wantAssertionsSigned: input.samlConfig.wantAssertionsSigned ?? true,
        signatureAlgorithm: input.samlConfig.signatureAlgorithm ?? "sha256",
        digestAlgorithm: input.samlConfig.digestAlgorithm ?? "sha256",
        identifierFormat:
          input.samlConfig.identifierFormat ?? "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
        authnRequestsSigned: saml.authnRequestsSigned,
      };
      body.issuer = saml.issuer;
      body.domain = saml.domain;
    } else if (input.oidcConfig) {
      body.oidcConfig = input.oidcConfig;
    }

    await auth.api.updateSSOProvider({ body, headers: headerList });
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      actorEmail: user.email,
      action: "sso.provider_updated",
      severity: "warning",
      metadata: { providerId: existing.providerId, issuer: input.issuer },
    });
    return { ok: true, providerId: existing.providerId };
  } catch (error) {
    log.error(error, "updateSSOProviderAction failed");
    return { ok: false, error: error instanceof Error ? error.message : "Failed to update SSO provider." };
  }
}

/** Delete an SSO provider. */
export async function deleteSSOProviderAction(
  providerId: string,
): Promise<SSOActionResult> {
  try {
    const { organization, user, roleKey } = await requirePermission("security:manage");
    if (roleKey !== "owner") {
      return { ok: false, error: "Only the workspace owner can manage enterprise SSO." };
    }

    const visibleProviders = await listSSOProvidersAction();
    const provider = visibleProviders.find(
      (candidate) => candidate.providerId === providerId && candidate.organizationId === organization.id,
    );
    if (!provider) return { ok: false, error: "SSO provider not found." };

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

/** Request the DNS TXT challenge for an existing provider. */
export async function requestSSODomainVerificationAction(
  providerId: string,
): Promise<SSOActionResult & { token?: string }> {
  try {
    const { organization, roleKey } = await requirePermission("security:manage");
    if (roleKey !== "owner") {
      return { ok: false, error: "Only the workspace owner can verify enterprise SSO domains." };
    }
    const provider = (await listSSOProvidersAction()).find(
      (candidate) => candidate.providerId === providerId && candidate.organizationId === organization.id,
    );
    if (!provider) return { ok: false, error: "SSO provider not found." };

    const result = await (auth.api as unknown as DomainVerificationApi).requestDomainVerification({
      body: { providerId },
      headers: await headers(),
    });
    return { ok: true, providerId, token: result.domainVerificationToken };
  } catch (error) {
    log.error(error, "requestSSODomainVerificationAction failed");
    return { ok: false, error: error instanceof Error ? error.message : "Failed to request domain verification." };
  }
}

/** Verify the DNS TXT challenge for an existing provider. */
export async function verifySSODomainAction(providerId: string): Promise<SSOActionResult> {
  try {
    const { organization, user, roleKey } = await requirePermission("security:manage");
    if (roleKey !== "owner") {
      return { ok: false, error: "Only the workspace owner can verify enterprise SSO domains." };
    }
    const provider = (await listSSOProvidersAction()).find(
      (candidate) => candidate.providerId === providerId && candidate.organizationId === organization.id,
    );
    if (!provider) return { ok: false, error: "SSO provider not found." };

    await (auth.api as unknown as DomainVerificationApi).verifyDomain({
      body: { providerId },
      headers: await headers(),
    });
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      actorEmail: user.email,
      action: "sso.domain_verified",
      severity: "warning",
      metadata: { providerId },
    });
    return { ok: true, providerId };
  } catch (error) {
    log.error(error, "verifySSODomainAction failed");
    return { ok: false, error: error instanceof Error ? error.message : "Failed to verify SSO domain." };
  }
}
