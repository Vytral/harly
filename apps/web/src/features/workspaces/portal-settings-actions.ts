"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, workspaceSettings } from "@harly/db";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { logAuditEvent } from "@/lib/audit-log";
import {
  PORTAL_METHOD_KEYS,
  PORTAL_METHOD_LABELS,
  getPortalAuthRequirements,
  getStoredPortalAuthConfig,
  validatePortalAuthConfig,
  type PortalAuthConfig,
} from "@/lib/portal-auth-methods";

import { assertNotDemo } from "@/features/demo/assert-not-demo";

export type PortalSettingsResult = { ok: boolean; error?: string };

export async function savePortalSettingsAction(
  enabled: boolean,
): Promise<PortalSettingsResult> {
  assertNotDemo();
  const context = await requirePermission("settings:edit");

  await db
    .insert(workspaceSettings)
    .values({
      organizationId: context.organization.id,
      candidatePortalEnabled: enabled,
    })
    .onConflictDoUpdate({
      target: workspaceSettings.organizationId,
      set: { candidatePortalEnabled: enabled, updatedAt: new Date() },
    });

  revalidatePath("/settings/portal");
  return { ok: true };
}

/**
 * Saves which sign-in methods candidates may use. The server re-checks the
 * requirements and refuses a configuration that leaves no usable method, no
 * matter what the UI sent.
 */
export async function savePortalAuthMethodsAction(
  input: PortalAuthConfig,
): Promise<PortalSettingsResult> {
  assertNotDemo();
  const context = await requirePermission("settings:edit");
  const workspaceId = context.organization.id;

  const next = {} as PortalAuthConfig;
  for (const key of PORTAL_METHOD_KEYS) next[key] = input?.[key] === true;

  const [previous, req] = await Promise.all([
    getStoredPortalAuthConfig(workspaceId),
    getPortalAuthRequirements(workspaceId),
  ]);
  const verdict = validatePortalAuthConfig(next, req);
  if (!verdict.ok) return { ok: false, error: verdict.error };

  await db
    .insert(workspaceSettings)
    .values({ organizationId: workspaceId, portalAuthMethods: next })
    .onConflictDoUpdate({
      target: workspaceSettings.organizationId,
      set: { portalAuthMethods: next, updatedAt: new Date() },
    });

  for (const key of PORTAL_METHOD_KEYS) {
    if (previous[key] === next[key]) continue;
    await logAuditEvent({
      workspaceId,
      actorId: context.user.id,
      actorEmail: context.user.email,
      action: next[key]
        ? "portal.auth_method_enabled"
        : "portal.auth_method_disabled",
      resourceType: "workspace_settings",
      resourceId: workspaceId,
      metadata: { method: key, label: PORTAL_METHOD_LABELS[key] },
      severity: next[key] ? "info" : "warning",
    });
  }

  revalidatePath("/settings/portal");
  return { ok: true };
}

const oauthSchema = z.object({
  provider: z.enum(["google", "github", "linkedin"]),
  clientId: z.string().trim().max(200),
  clientSecret: z.string().trim().max(500).optional(),
});

export async function savePortalOAuthAction(input: {
  provider: "google" | "github" | "linkedin";
  clientId: string;
  clientSecret?: string;
}): Promise<PortalSettingsResult> {
  assertNotDemo();
  const context = await requirePermission("settings:edit");

  if (!isEncryptionConfigured()) {
    return { ok: false, error: "Server encryption key not configured." };
  }

  const parsed = oauthSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };

  const { provider, clientId, clientSecret } = parsed.data;

  const [existing] = await db
    .select(
      provider === "google"
        ? {
            hasCiphertext: workspaceSettings.portalGoogleClientSecretCiphertext,
          }
        : provider === "github"
          ? {
              hasCiphertext:
                workspaceSettings.portalGithubClientSecretCiphertext,
            }
          : {
              hasCiphertext:
                workspaceSettings.portalLinkedinClientSecretCiphertext,
            },
    )
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, context.organization.id))
    .limit(1);

  const hasStored = Boolean(
    (existing as { hasCiphertext: string | null } | undefined)?.hasCiphertext,
  );

  // If no new secret provided, keep existing (must have one stored already for ID-only updates).
  if (!clientSecret && !hasStored) {
    return {
      ok: false,
      error: "Provide the Client Secret to configure this provider.",
    };
  }

  let set: Record<string, unknown>;
  if (provider === "google") {
    set = { portalGoogleClientId: clientId || null, updatedAt: new Date() };
    if (clientSecret) {
      const enc = encryptSecret(clientSecret);
      set.portalGoogleClientSecretCiphertext = enc.ciphertext;
      set.portalGoogleClientSecretIv = enc.iv;
      set.portalGoogleClientSecretTag = enc.tag;
    }
  } else if (provider === "github") {
    set = { portalGithubClientId: clientId || null, updatedAt: new Date() };
    if (clientSecret) {
      const enc = encryptSecret(clientSecret);
      set.portalGithubClientSecretCiphertext = enc.ciphertext;
      set.portalGithubClientSecretIv = enc.iv;
      set.portalGithubClientSecretTag = enc.tag;
    }
  } else {
    set = { portalLinkedinClientId: clientId || null, updatedAt: new Date() };
    if (clientSecret) {
      const enc = encryptSecret(clientSecret);
      set.portalLinkedinClientSecretCiphertext = enc.ciphertext;
      set.portalLinkedinClientSecretIv = enc.iv;
      set.portalLinkedinClientSecretTag = enc.tag;
    }
  }

  await db
    .insert(workspaceSettings)
    .values({ organizationId: context.organization.id, ...set })
    .onConflictDoUpdate({ target: workspaceSettings.organizationId, set });

  revalidatePath("/settings/portal");
  return { ok: true };
}

export async function disconnectPortalOAuthAction(
  provider: "google" | "github" | "linkedin",
): Promise<PortalSettingsResult> {
  assertNotDemo();
  const context = await requirePermission("settings:edit");

  // Refuse to remove credentials if that would leave the portal with no usable
  // sign-in method (platform env credentials, if any, keep the provider alive).
  const envFallback = Boolean(
    provider === "google"
      ? process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      : provider === "github"
        ? process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
        : process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET,
  );
  const [config, req] = await Promise.all([
    getStoredPortalAuthConfig(context.organization.id),
    getPortalAuthRequirements(context.organization.id),
  ]);
  const verdict = validatePortalAuthConfig(config, {
    ...req,
    [provider]: envFallback,
  });
  if (!verdict.ok) {
    return {
      ok: false,
      error: `${verdict.error} Enable another method before disconnecting this provider.`,
    };
  }

  const set =
    provider === "google"
      ? {
          portalGoogleClientId: null,
          portalGoogleClientSecretCiphertext: null,
          portalGoogleClientSecretIv: null,
          portalGoogleClientSecretTag: null,
          updatedAt: new Date(),
        }
      : provider === "github"
        ? {
            portalGithubClientId: null,
            portalGithubClientSecretCiphertext: null,
            portalGithubClientSecretIv: null,
            portalGithubClientSecretTag: null,
            updatedAt: new Date(),
          }
        : {
            portalLinkedinClientId: null,
            portalLinkedinClientSecretCiphertext: null,
            portalLinkedinClientSecretIv: null,
            portalLinkedinClientSecretTag: null,
            updatedAt: new Date(),
          };

  await db
    .update(workspaceSettings)
    .set(set)
    .where(eq(workspaceSettings.organizationId, context.organization.id));

  revalidatePath("/settings/portal");
  return { ok: true };
}

export async function savePortalUiOptionsAction(input: {
  showApplicationStatus: boolean;
  showHiringTeam: boolean;
}): Promise<PortalSettingsResult> {
  assertNotDemo();
  const context = await requirePermission("settings:edit");

  await db
    .insert(workspaceSettings)
    .values({
      organizationId: context.organization.id,
      portalShowApplicationStatus: input.showApplicationStatus,
      portalShowHiringTeam: input.showHiringTeam,
    })
    .onConflictDoUpdate({
      target: workspaceSettings.organizationId,
      set: {
        portalShowApplicationStatus: input.showApplicationStatus,
        portalShowHiringTeam: input.showHiringTeam,
        updatedAt: new Date(),
      },
    });

  revalidatePath("/settings/portal");
  return { ok: true };
}
