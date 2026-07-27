"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, workspaceSettings } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { getWorkspaceEsignConfig, getWorkspaceEsignStatus } from "@/lib/esign/config";

export type EsignSettingsActionResult = { ok: boolean; error?: string };

const SETTINGS_PATH = "/settings/integrations";

const saveSchema = z.object({
  url: z.string().trim().url().max(500),
  // When blank, the previously stored token is kept.
  apiToken: z.string().trim().max(500).optional(),
});

/** Normalize to the origin + optional base path, dropping a trailing /api. */
function cleanUrl(value: string): string {
  const u = new URL(value);
  const path = u.pathname.replace(/\/?api\/?$/i, "").replace(/\/$/, "");
  return `${u.origin}${path}`;
}

/**
 * Save the DocuSeal instance URL + API token. The token is encrypted at rest.
 * A webhook secret is generated on first save so the inbound webhook endpoint
 * can authenticate DocuSeal callbacks. Enabling requires both URL and token.
 */
export async function saveEsignSettingsAction(input: {
  url: string;
  apiToken?: string;
  enabled: boolean;
}): Promise<EsignSettingsActionResult> {
  const context = await requirePermission("integrations:manage");

  if (!isEncryptionConfigured()) {
    return {
      ok: false,
      error: "Server is missing AI_ENCRYPTION_KEY. Set it to store the DocuSeal API token.",
    };
  }

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a valid DocuSeal URL." };
  }

  const status = await getWorkspaceEsignStatus(context.organization.id);
  const willHaveToken = Boolean(parsed.data.apiToken || status.hasToken);
  if (input.enabled && !willHaveToken) {
    return { ok: false, error: "Add the API token before enabling DocuSeal." };
  }

  const tokenColumns = parsed.data.apiToken
    ? (() => {
        const enc = encryptSecret(parsed.data.apiToken as string);
        return {
          docusealApiTokenCiphertext: enc.ciphertext,
          docusealApiTokenIv: enc.iv,
          docusealApiTokenTag: enc.tag,
        };
      })()
    : {};

  // Generate a webhook secret once; keep the existing one on subsequent saves.
  const webhookSecret = status.hasWebhookSecret
    ? {}
    : { docusealWebhookSecret: `dsw_${randomBytes(24).toString("base64url")}` };

  await db
    .insert(workspaceSettings)
    .values({
      organizationId: context.organization.id,
      docusealEnabled: input.enabled,
      docusealUrl: cleanUrl(parsed.data.url),
      ...tokenColumns,
      ...webhookSecret,
    })
    .onConflictDoUpdate({
      target: workspaceSettings.organizationId,
      set: {
        docusealEnabled: input.enabled,
        docusealUrl: cleanUrl(parsed.data.url),
        ...tokenColumns,
        ...webhookSecret,
        updatedAt: new Date(),
      },
    });

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/** Toggle the per-workspace offer delivery channel (email | esign | native). */
export async function saveOfferSignatureChannelAction(
  channel: "email" | "esign" | "native",
): Promise<EsignSettingsActionResult> {
  const context = await requirePermission("integrations:manage");

  const status = await getWorkspaceEsignStatus(context.organization.id);
  if (channel === "esign" && (!status.enabled || !status.hasToken || !status.hasWebhookSecret)) {
    return {
      ok: false,
      error: "Connect DocuSeal and save its webhook secret before using it for offer signatures.",
    };
  }

  await db
    .update(workspaceSettings)
    .set({ offerSignatureChannel: channel, updatedAt: new Date() })
    .where(eq(workspaceSettings.organizationId, context.organization.id));

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/** Disconnect DocuSeal: clear config columns + reset offer channel to email. */
export async function disconnectEsignAction(): Promise<EsignSettingsActionResult> {
  const context = await requirePermission("integrations:manage");

  await db
    .update(workspaceSettings)
    .set({
      docusealEnabled: false,
      docusealUrl: null,
      docusealApiTokenCiphertext: null,
      docusealApiTokenIv: null,
      docusealApiTokenTag: null,
      docusealWebhookSecret: null,
      offerSignatureChannel: "email",
      updatedAt: new Date(),
    })
    .where(eq(workspaceSettings.organizationId, context.organization.id));

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/** Verify the connection by listing templates against the DocuSeal instance. */
export async function testEsignAction(): Promise<EsignSettingsActionResult> {
  const context = await requirePermission("integrations:manage");
  const config = await getWorkspaceEsignConfig(context.organization.id);
  if (!config) return { ok: false, error: "DocuSeal is not connected." };

  try {
    const res = await fetch(`${config.apiUrl}/templates?limit=1`, {
      headers: { "X-Auth-Token": config.apiToken, Accept: "application/json" },
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `DocuSeal returned ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Connection test failed.";
    return { ok: false, error: msg };
  }
}
