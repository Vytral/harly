"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db, workspaceSettings } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { assertNotDemo } from "@/features/demo/assert-not-demo";
import {
  clearIntegrationHealth,
  recordIntegrationFailure,
  recordIntegrationSuccess,
} from "@/features/integrations/health/repository";
import { logAuditEvent } from "@/lib/audit-log";
import { createLogger } from "@/lib/logger";
import { DEFAULT_JITSI_BASE_URL } from "@/lib/jitsi/config";
import { safeFetchWebhook } from "@/lib/ssrf";
import { eq } from "drizzle-orm";
import { getTranslations } from "@/i18n/server";

const log = createLogger("workspace-jitsi-settings");

export type JitsiActionResult = { ok: boolean; error?: string };

const SETTINGS_PATH = "/settings/integrations";

/**
 * Validate a Jitsi instance base URL. We only ever compose links from it (no
 * server-side fetch besides the explicit test action), but keep it strict:
 * https, parseable, no embedded credentials, no query/hash.
 */
function validateBaseUrl(raw: string, t: Translate): { url?: string; error?: string } {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!URL.canParse(trimmed)) return { error: t("invalidUrl") };
  const parsed = new URL(trimmed);
  if (parsed.protocol !== "https:") return { error: t("httpsRequired") };
  if (parsed.username || parsed.password) {
    return { error: t("noCredentials") };
  }
  if (parsed.search || parsed.hash) {
    return { error: t("noQueryOrFragment") };
  }
  return { url: trimmed };
}

type Translate = (key: string, values?: Record<string, string | number>) => string;

function buildSaveSchema(t: Translate) {
  return z.object({
    enabled: z.boolean(),
    baseUrl: z.string().trim().min(1, t("baseUrlRequired")).max(300),
  });
}

export async function saveJitsiSettingsAction(input: {
  enabled: boolean;
  baseUrl: string;
}): Promise<JitsiActionResult> {
  assertNotDemo();
  const context = await requirePermission("integrations:manage");

  const t = await getTranslations("server.workspaces.jitsiSettingsActions");
  const parsed = buildSaveSchema(t).safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? t("invalidInput"),
    };
  }

  const { url, error } = validateBaseUrl(parsed.data.baseUrl, t);
  if (!url) return { ok: false, error };

  const set = {
    jitsiEnabled: parsed.data.enabled,
    jitsiBaseUrl: url,
    updatedAt: new Date(),
  };

  await db
    .insert(workspaceSettings)
    .values({ organizationId: context.organization.id, ...set })
    .onConflictDoUpdate({
      target: workspaceSettings.organizationId,
      set,
    });

  await logAuditEvent({
    workspaceId: context.organization.id,
    actorId: context.user.id,
    actorEmail: context.user.email,
    action: parsed.data.enabled
      ? "integrations.jitsi_connected"
      : "integrations.jitsi_updated",
    metadata: { baseUrl: url },
  });

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

export async function disconnectJitsiAction(): Promise<JitsiActionResult> {
  assertNotDemo();
  const context = await requirePermission("integrations:manage");

  await db
    .update(workspaceSettings)
    .set({ jitsiEnabled: false, jitsiBaseUrl: null, updatedAt: new Date() })
    .where(eq(workspaceSettings.organizationId, context.organization.id));
  await clearIntegrationHealth(context.organization.id, "jitsi");

  await logAuditEvent({
    workspaceId: context.organization.id,
    actorId: context.user.id,
    actorEmail: context.user.email,
    action: "integrations.jitsi_disconnected",
  });

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/**
 * Explicit connection validation: confirm the instance answers over https.
 * Uses the just-entered URL when provided, else the stored one.
 */
export async function testJitsiConnectionAction(input: {
  baseUrl?: string;
}): Promise<JitsiActionResult> {
  assertNotDemo();
  const context = await requirePermission("integrations:manage");
  const t = await getTranslations("server.workspaces.jitsiSettingsActions");

  let target = input.baseUrl?.trim() || null;
  if (!target) {
    const [row] = await db
      .select({ jitsiBaseUrl: workspaceSettings.jitsiBaseUrl })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, context.organization.id))
      .limit(1);
    target = row?.jitsiBaseUrl ?? DEFAULT_JITSI_BASE_URL;
  }

  const { url, error } = validateBaseUrl(target, t);
  if (!url) return { ok: false, error };

  // Only the saved instance is health-tracked; an unsaved URL is just a check.
  const testsSavedUrl = !input.baseUrl?.trim();
  const workspaceId = testsSavedUrl ? context.organization.id : null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await safeFetchWebhook(url, {
        method: "GET",
        signal: controller.signal,
      });
      if (!res.ok) {
        const failure = Object.assign(
          new Error(`Jitsi instance returned ${res.status}`),
          { status: res.status },
        );
        if (workspaceId) await recordIntegrationFailure(workspaceId, "jitsi", failure);
        return {
          ok: false,
          error: t("instanceReturnedStatus", { status: res.status }),
        };
      }
      if (workspaceId) await recordIntegrationSuccess(workspaceId, "jitsi");
      return { ok: true };
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    log.error(err, "testJitsiConnectionAction failed");
    if (workspaceId) await recordIntegrationFailure(workspaceId, "jitsi", err);
    return {
      ok: false,
      error:
        err instanceof Error && err.name === "AbortError"
          ? t("instanceTimedOut")
          : t("cannotReach"),
    };
  }
}
