"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db, workspaceSettings } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { logAuditEvent } from "@/lib/audit-log";
import { createLogger } from "@/lib/logger";
import { DEFAULT_JITSI_BASE_URL } from "@/lib/jitsi/config";
import { eq } from "drizzle-orm";

const log = createLogger("workspace-jitsi-settings");

export type JitsiActionResult = { ok: boolean; error?: string };

const SETTINGS_PATH = "/settings/integrations";

/**
 * Validate a Jitsi instance base URL. We only ever compose links from it (no
 * server-side fetch besides the explicit test action), but keep it strict:
 * https, parseable, no embedded credentials, no query/hash.
 */
function validateBaseUrl(raw: string): { url?: string; error?: string } {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!URL.canParse(trimmed)) return { error: "Enter a valid URL." };
  const parsed = new URL(trimmed);
  if (parsed.protocol !== "https:") return { error: "Base URL must use https." };
  if (parsed.username || parsed.password) {
    return { error: "Base URL must not contain credentials." };
  }
  if (parsed.search || parsed.hash) {
    return { error: "Base URL must not contain a query string or fragment." };
  }
  return { url: trimmed };
}

const saveSchema = z.object({
  enabled: z.boolean(),
  baseUrl: z.string().trim().min(1, "Base URL is required.").max(300),
});

export async function saveJitsiSettingsAction(input: {
  enabled: boolean;
  baseUrl: string;
}): Promise<JitsiActionResult> {
  const context = await requirePermission("integrations:manage");

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const { url, error } = validateBaseUrl(parsed.data.baseUrl);
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
  const context = await requirePermission("integrations:manage");

  await db
    .update(workspaceSettings)
    .set({ jitsiEnabled: false, jitsiBaseUrl: null, updatedAt: new Date() })
    .where(eq(workspaceSettings.organizationId, context.organization.id));

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
  const context = await requirePermission("integrations:manage");

  let target = input.baseUrl?.trim() || null;
  if (!target) {
    const [row] = await db
      .select({ jitsiBaseUrl: workspaceSettings.jitsiBaseUrl })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, context.organization.id))
      .limit(1);
    target = row?.jitsiBaseUrl ?? DEFAULT_JITSI_BASE_URL;
  }

  const { url, error } = validateBaseUrl(target);
  if (!url) return { ok: false, error };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      return {
        ok: false,
        error: `Instance responded with HTTP ${res.status}.`,
      };
    }
    return { ok: true };
  } catch (err) {
    log.error(err, "testJitsiConnectionAction failed");
    return {
      ok: false,
      error:
        err instanceof Error && err.name === "AbortError"
          ? "Instance did not respond within 5 seconds."
          : "Could not reach that instance.",
    };
  }
}
