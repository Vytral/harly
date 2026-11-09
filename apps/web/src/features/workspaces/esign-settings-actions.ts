"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, workspaceSettings } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { assertNotDemo } from "@/features/demo/assert-not-demo";
import {
  clearIntegrationHealth,
  recordIntegrationFailure,
  recordIntegrationSuccess,
} from "@/features/integrations/health/repository";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { getWorkspaceEsignConfig, getWorkspaceEsignStatus } from "@/lib/esign/config";
import { resolveSafeAddress, safeFetchHttp } from "@/lib/ssrf";
import { getTranslations } from "@/i18n/server";

export type EsignSettingsActionResult = { ok: boolean; error?: string };

const SETTINGS_PATH = "/settings/integrations";

const saveSchema = z.object({
  url: z.string().trim().url().max(500),
  // When blank, the previously stored token is kept.
  apiToken: z.string().trim().max(500).optional(),
});

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** Normalize to the origin + optional base path, dropping a trailing /api. */
function cleanUrl(value: string): string {
  const u = new URL(value);
  const path = u.pathname.replace(/\/?api\/?$/i, "").replace(/\/$/, "");
  return `${u.origin}${path}`;
}

async function validateDocusealUrl(value: string, t: Translate): Promise<string> {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") {
    throw new Error(t("httpsRequired"));
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(t("noCredentialsInUrl"));
  }
  const cleaned = cleanUrl(value);
  await resolveSafeAddress(new URL(cleaned).hostname);
  return cleaned;
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
  assertNotDemo();
  const context = await requirePermission("integrations:manage");
  const t = await getTranslations("server.workspaces.esignSettingsActions");

  if (!isEncryptionConfigured()) {
    return {
      ok: false,
      error: t("encryptionKeyMissing"),
    };
  }

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t("invalidUrl") };
  }

  let docusealUrl: string;
  try {
    docusealUrl = await validateDocusealUrl(parsed.data.url, t);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : t("safeUrl"),
    };
  }

  const status = await getWorkspaceEsignStatus(context.organization.id);
  const existingUrl = (() => {
    try {
      const rawConfiguredUrl = status.configuredUrl ?? status.url;
      return rawConfiguredUrl
        ? new URL(rawConfiguredUrl).origin +
            new URL(rawConfiguredUrl).pathname.replace(/\/?api\/?$/i, "").replace(/\/$/, "")
        : null;
    } catch {
      return null;
    }
  })();
  if (
    !parsed.data.apiToken &&
    status.hasToken &&
    (!existingUrl || docusealUrl !== existingUrl)
  ) {
    return {
      ok: false,
      error: t("apiTokenRequiredForUrlChange"),
    };
  }
  const willHaveToken = Boolean(parsed.data.apiToken || status.hasToken);
  if (input.enabled && !willHaveToken) {
    return { ok: false, error: t("apiTokenRequiredToEnable") };
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
      docusealUrl,
      ...tokenColumns,
      ...webhookSecret,
    })
    .onConflictDoUpdate({
      target: workspaceSettings.organizationId,
      set: {
        docusealEnabled: input.enabled,
        docusealUrl,
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
  assertNotDemo();
  const context = await requirePermission("integrations:manage");
  const t = await getTranslations("server.workspaces.esignSettingsActions");

  const status = await getWorkspaceEsignStatus(context.organization.id);
  if (channel === "esign" && (!status.enabled || !status.hasToken || !status.hasWebhookSecret)) {
    return {
      ok: false,
      error: t("notConnectedForOffers"),
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
  assertNotDemo();
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

  await clearIntegrationHealth(context.organization.id, "docuseal");
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/** Verify the connection by listing templates against the DocuSeal instance. */
export async function testEsignAction(): Promise<EsignSettingsActionResult> {
  assertNotDemo();
  const context = await requirePermission("integrations:manage");
  const t = await getTranslations("server.workspaces.esignSettingsActions");
  const config = await getWorkspaceEsignConfig(context.organization.id);
  if (!config) return { ok: false, error: t("notConnected") };

  try {
    const res = await safeFetchHttp(`${config.apiUrl}/templates?limit=1`, {
      headers: { "X-Auth-Token": config.apiToken, Accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      const body = await res.text();
      const failure = new Error(`DocuSeal API ${res.status}: ${body.slice(0, 200)}`);
      await recordIntegrationFailure(context.organization.id, "docuseal", failure);
      return { ok: false, error: t("returnedStatus", { status: res.status, body: body.slice(0, 200) }) };
    }
    await recordIntegrationSuccess(context.organization.id, "docuseal");
    return { ok: true };
  } catch (error) {
    await recordIntegrationFailure(context.organization.id, "docuseal", error);
    const msg = error instanceof Error ? error.message : t("connectionTestFailed");
    return { ok: false, error: msg };
  }
}
