"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, workspaceSettings } from "@harly/db";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto";

export type PortalSettingsResult = { ok: boolean; error?: string };

export async function savePortalSettingsAction(
  enabled: boolean,
): Promise<PortalSettingsResult> {
  const context = await requirePermission("settings:edit");

  await db
    .insert(workspaceSettings)
    .values({ organizationId: context.organization.id, candidatePortalEnabled: enabled })
    .onConflictDoUpdate({
      target: workspaceSettings.organizationId,
      set: { candidatePortalEnabled: enabled, updatedAt: new Date() },
    });

  revalidatePath("/settings/portal");
  return { ok: true };
}

const oauthSchema = z.object({
  provider: z.enum(["google", "github"]),
  clientId: z.string().trim().max(200),
  clientSecret: z.string().trim().max(500).optional(),
});

export async function savePortalOAuthAction(input: {
  provider: "google" | "github";
  clientId: string;
  clientSecret?: string;
}): Promise<PortalSettingsResult> {
  const context = await requirePermission("settings:edit");

  if (!isEncryptionConfigured()) {
    return { ok: false, error: "Server encryption key not configured." };
  }

  const parsed = oauthSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const { provider, clientId, clientSecret } = parsed.data;

  const [existing] = await db
    .select(
      provider === "google"
        ? { hasCiphertext: workspaceSettings.portalGoogleClientSecretCiphertext }
        : { hasCiphertext: workspaceSettings.portalGithubClientSecretCiphertext },
    )
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, context.organization.id))
    .limit(1);

  const hasStored = Boolean((existing as { hasCiphertext: string | null } | undefined)?.hasCiphertext);

  // If no new secret provided, keep existing (must have one stored already for ID-only updates).
  if (!clientSecret && !hasStored) {
    return { ok: false, error: "Provide the Client Secret to configure this provider." };
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
  } else {
    set = { portalGithubClientId: clientId || null, updatedAt: new Date() };
    if (clientSecret) {
      const enc = encryptSecret(clientSecret);
      set.portalGithubClientSecretCiphertext = enc.ciphertext;
      set.portalGithubClientSecretIv = enc.iv;
      set.portalGithubClientSecretTag = enc.tag;
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
  provider: "google" | "github",
): Promise<PortalSettingsResult> {
  const context = await requirePermission("settings:edit");

  const set =
    provider === "google"
      ? {
          portalGoogleClientId: null,
          portalGoogleClientSecretCiphertext: null,
          portalGoogleClientSecretIv: null,
          portalGoogleClientSecretTag: null,
          updatedAt: new Date(),
        }
      : {
          portalGithubClientId: null,
          portalGithubClientSecretCiphertext: null,
          portalGithubClientSecretIv: null,
          portalGithubClientSecretTag: null,
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
}): Promise<PortalSettingsResult> {
  const context = await requirePermission("settings:edit");

  await db
    .insert(workspaceSettings)
    .values({ organizationId: context.organization.id, portalShowApplicationStatus: input.showApplicationStatus })
    .onConflictDoUpdate({
      target: workspaceSettings.organizationId,
      set: { portalShowApplicationStatus: input.showApplicationStatus, updatedAt: new Date() },
    });

  revalidatePath("/settings/portal");
  return { ok: true };
}
