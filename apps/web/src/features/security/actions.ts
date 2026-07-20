"use server";

import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db, passkeys, workspaceSettings, oauthProviders } from "@harly/db";
import { auth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit-log";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { createLogger } from "@/lib/logger";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto";

const log = createLogger("security");

async function getSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");
  return session;
}

export async function deletePasskeyAction(passkeyId: string) {
  const session = await getSession();
  const { organization } = await getWorkspaceContext();

  await db
    .delete(passkeys)
    .where(
      and(eq(passkeys.id, passkeyId), eq(passkeys.userId, session.user.id)),
    );

  await logAuditEvent({
    workspaceId: organization.id,
    actorId: session.user.id,
    actorEmail: session.user.email,
    action: "passkey.deleted",
    resourceType: "passkey",
    resourceId: passkeyId,
    severity: "warning",
  });
}

export async function toggleForce2FAAction(
  require2fa: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { organization, roleKey, user } =
      await requirePermission("security:manage");
    if (roleKey !== "owner")
      throw new Error("Only owners can change this setting.");

    await db
      .insert(workspaceSettings)
      .values({ organizationId: organization.id, require2fa })
      .onConflictDoUpdate({
        target: workspaceSettings.organizationId,
        set: { require2fa },
      });

    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      actorEmail: user.email,
      action: require2fa ? "settings.2fa_enforced" : "settings.2fa_unenforced",
      severity: "critical",
      metadata: { require2fa },
    });

    return { ok: true };
  } catch (error) {
    log.error(error, "toggleForce2FAAction failed");
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OAuth Provider Configuration
// ─────────────────────────────────────────────────────────────────────────────

export type OAuthProvider = "google" | "microsoft" | "github" | "linkedin";
export type OAuthActionResult = { ok: boolean; error?: string };

export type OAuthProviderConfig = {
  id: string;
  provider: OAuthProvider;
  clientId: string;
  enabled: boolean;
  hasSecret: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** List all OAuth providers configured for this workspace. */
export async function listOAuthProvidersAction(): Promise<
  OAuthProviderConfig[]
> {
  const { organization } = await getWorkspaceContext();

  const rows = await db
    .select()
    .from(oauthProviders)
    .where(eq(oauthProviders.workspaceId, organization.id))
    .orderBy(oauthProviders.provider);

  return rows.map((r) => ({
    id: r.id,
    provider: r.provider as OAuthProvider,
    clientId: r.clientId,
    enabled: r.enabled,
    hasSecret: Boolean(r.clientSecretCiphertext),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

/** Save or update OAuth provider credentials (Client ID + Secret). */
export async function saveOAuthProviderAction(input: {
  provider: OAuthProvider;
  clientId: string;
  clientSecret?: string;
  enabled?: boolean;
}): Promise<OAuthActionResult> {
  try {
    const { organization, roleKey, user } =
      await requirePermission("security:manage");
    if (roleKey !== "owner") {
      return { ok: false, error: "Only owners can configure OAuth providers." };
    }

    if (!isEncryptionConfigured()) {
      return {
        ok: false,
        error: "Server encryption key not configured. Set AI_ENCRYPTION_KEY.",
      };
    }

    const clientId = input.clientId.trim();
    const clientSecret = input.clientSecret?.trim();

    if (!clientId) {
      return { ok: false, error: "Client ID is required." };
    }

    const existing = await db.query.oauthProviders.findFirst({
      where: and(
        eq(oauthProviders.workspaceId, organization.id),
        eq(oauthProviders.provider, input.provider),
      ),
    });

    if (!clientSecret && !existing?.clientSecretCiphertext) {
      return {
        ok: false,
        error: "Client Secret is required for new configurations.",
      };
    }

    const encrypted = clientSecret ? encryptSecret(clientSecret) : null;

    await db
      .insert(oauthProviders)
      .values({
        workspaceId: organization.id,
        provider: input.provider,
        clientId,
        clientSecretCiphertext: encrypted?.ciphertext ?? null,
        clientSecretIv: encrypted?.iv ?? null,
        clientSecretTag: encrypted?.tag ?? null,
        enabled: input.enabled ?? true,
      })
      .onConflictDoUpdate({
        target: [oauthProviders.workspaceId, oauthProviders.provider],
        set: {
          clientId,
          ...(encrypted
            ? {
                clientSecretCiphertext: encrypted.ciphertext,
                clientSecretIv: encrypted.iv,
                clientSecretTag: encrypted.tag,
              }
            : {}),
          enabled: input.enabled ?? existing?.enabled ?? true,
          updatedAt: new Date(),
        },
      });

    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      actorEmail: user.email,
      action: "oauth.configured",
      severity: "warning",
      metadata: { provider: input.provider },
    });

    return { ok: true };
  } catch (error) {
    log.error(error, "saveOAuthProviderAction failed");
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed.",
    };
  }
}

/** Toggle an OAuth provider enabled/disabled. */
export async function toggleOAuthProviderAction(
  providerId: string,
  enabled: boolean,
): Promise<OAuthActionResult> {
  try {
    const { organization, roleKey, user } =
      await requirePermission("security:manage");
    if (roleKey !== "owner") {
      return { ok: false, error: "Only owners can change this setting." };
    }

    await db
      .update(oauthProviders)
      .set({ enabled, updatedAt: new Date() })
      .where(
        and(
          eq(oauthProviders.id, providerId),
          eq(oauthProviders.workspaceId, organization.id),
        ),
      );

    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      actorEmail: user.email,
      action: enabled ? "oauth.enabled" : "oauth.disabled",
      severity: "warning",
      metadata: { providerId },
    });

    return { ok: true };
  } catch (error) {
    log.error(error, "toggleOAuthProviderAction failed");
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed.",
    };
  }
}

/** Delete an OAuth provider configuration. */
export async function deleteOAuthProviderAction(
  providerId: string,
): Promise<OAuthActionResult> {
  try {
    const { organization, roleKey, user } =
      await requirePermission("security:manage");
    if (roleKey !== "owner") {
      return {
        ok: false,
        error: "Only owners can delete OAuth configurations.",
      };
    }

    const [row] = await db
      .select()
      .from(oauthProviders)
      .where(
        and(
          eq(oauthProviders.id, providerId),
          eq(oauthProviders.workspaceId, organization.id),
        ),
      )
      .limit(1);

    if (!row) {
      return { ok: false, error: "Provider not found." };
    }

    await db
      .delete(oauthProviders)
      .where(
        and(
          eq(oauthProviders.id, providerId),
          eq(oauthProviders.workspaceId, organization.id),
        ),
      );

    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      actorEmail: user.email,
      action: "oauth.deleted",
      severity: "critical",
      metadata: { provider: row.provider },
    });

    return { ok: true };
  } catch (error) {
    log.error(error, "deleteOAuthProviderAction failed");
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed.",
    };
  }
}

/** Check which OAuth providers are configured (from DB or env vars). */
export async function getOAuthProviderStatus(): Promise<
  Record<OAuthProvider, { configured: boolean; source: "db" | "env" | null }>
> {
  const { organization } = await getWorkspaceContext();

  const rows = await db
    .select()
    .from(oauthProviders)
    .where(eq(oauthProviders.workspaceId, organization.id));

  const dbProviders = new Map(rows.map((r) => [r.provider, r]));

  const providers: OAuthProvider[] = [
    "google",
    "microsoft",
    "github",
    "linkedin",
  ];
  const result: Record<
    OAuthProvider,
    { configured: boolean; source: "db" | "env" | null }
  > = {
    google: { configured: false, source: null },
    microsoft: { configured: false, source: null },
    github: { configured: false, source: null },
    linkedin: { configured: false, source: null },
  };

  for (const provider of providers) {
    const dbRow = dbProviders.get(provider);
    if (dbRow && dbRow.enabled && dbRow.clientSecretCiphertext) {
      result[provider] = { configured: true, source: "db" };
    } else {
      // Fallback to env vars
      const envKey = `${provider.toUpperCase()}_CLIENT_ID`;
      if (process.env[envKey]) {
        result[provider] = { configured: true, source: "env" };
      }
    }
  }

  return result;
}
