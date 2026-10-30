"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { assertNotDemo } from "@/features/demo/assert-not-demo";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { createLogger } from "@/lib/logger";
import {
  getWorkspaceOutlookConfig,
  recordOutlookCallFailure,
} from "@/lib/outlook/config";
import { listCalendars, sendMail } from "@/lib/outlook/client";
import {
  clearIntegrationHealth,
  getIntegrationHealth,
  recordIntegrationSuccess,
} from "@/features/integrations/health/repository";
import { sanitizeIntegrationError } from "@/features/integrations/health/model";
import { isWebhookEvent } from "@/server/webhooks/events";

const log = createLogger("workspace-outlook-settings");

export type OutlookActionResult = { ok: boolean; error?: string };

const SETTINGS_PATH = "/settings/integrations";

const RECONNECT_MESSAGE =
  "Microsoft revoked this connection. Disconnect and reconnect Outlook.";

/**
 * Message for a workspace whose Outlook config is unusable. A connection that
 * Microsoft revoked was cleared by the config read, so the stored health
 * decides between "reconnect" and "not connected".
 */
async function unusableOutlookMessage(workspaceId: string): Promise<string> {
  const health = await getIntegrationHealth(workspaceId);
  return health.outlook?.state === "needs_reconnect"
    ? RECONNECT_MESSAGE
    : "Outlook not connected.";
}

export type OutlookCalendarItem = { id: string; name: string };

/** Save Outlook App credentials (Client ID + Secret) for this workspace. */
export async function saveOutlookCredentialsAction(input: {
  clientId: string;
  clientSecret: string;
}): Promise<OutlookActionResult> {
  assertNotDemo();
  const context = await requirePermission("integrations:manage");

  if (!isEncryptionConfigured()) {
    return { ok: false, error: "Server encryption key not configured." };
  }

  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();

  if (!clientId || !clientSecret) {
    return {
      ok: false,
      error: "Both Client ID and Client Secret are required.",
    };
  }

  const encrypted = encryptSecret(clientSecret);

  const set: Partial<typeof workspaceSettings.$inferInsert> = {
    outlookClientId: clientId,
    outlookClientSecretCiphertext: encrypted.ciphertext,
    outlookClientSecretIv: encrypted.iv,
    outlookClientSecretTag: encrypted.tag,
    updatedAt: new Date(),
  };

  await db
    .insert(workspaceSettings)
    .values({ organizationId: context.organization.id, ...set })
    .onConflictDoUpdate({ target: workspaceSettings.organizationId, set });

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/** List calendars the authenticated Outlook account can write to. */
export async function listOutlookCalendarsAction(): Promise<
  { ok: true; calendars: OutlookCalendarItem[] } | { ok: false; error: string }
> {
  assertNotDemo();
  const context = await requirePermission("integrations:manage");
  const config = await getWorkspaceOutlookConfig(context.organization.id);
  if (!config) {
    return { ok: false, error: await unusableOutlookMessage(context.organization.id) };
  }

  try {
    const calendars = await listCalendars(config.accessToken);
    await recordIntegrationSuccess(context.organization.id, "outlook");
    revalidatePath(SETTINGS_PATH);
    return {
      ok: true,
      calendars: calendars.map((c) => ({ id: c.id, name: c.name })),
    };
  } catch (error) {
    log.error(error, "listOutlookCalendarsAction failed");
    if (await recordOutlookCallFailure(context.organization.id, error)) {
      revalidatePath(SETTINGS_PATH);
      return { ok: false, error: RECONNECT_MESSAGE };
    }
    return { ok: false, error: "Failed to fetch calendars from Outlook." };
  }
}

/** Save the selected calendar and events. */
export async function saveOutlookSettingsAction(input: {
  calendarId: string;
  events: string[];
  enabled: boolean;
}): Promise<OutlookActionResult> {
  assertNotDemo();
  const context = await requirePermission("integrations:manage");

  const cleanEvents = input.events.filter(isWebhookEvent);

  await db
    .update(workspaceSettings)
    .set({
      outlookEnabled: input.enabled,
      outlookCalendarId: input.calendarId,
      outlookEvents: cleanEvents,
      updatedAt: new Date(),
    })
    .where(eq(workspaceSettings.organizationId, context.organization.id));

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/** Disconnect Outlook: clear all outlook columns. */
export async function disconnectOutlookAction(): Promise<OutlookActionResult> {
  assertNotDemo();
  const context = await requirePermission("integrations:manage");

  await db
    .update(workspaceSettings)
    .set({
      outlookEnabled: false,
      outlookAccountEmail: null,
      outlookAccessTokenCiphertext: null,
      outlookAccessTokenIv: null,
      outlookAccessTokenTag: null,
      outlookRefreshTokenCiphertext: null,
      outlookRefreshTokenIv: null,
      outlookRefreshTokenTag: null,
      outlookCalendarId: null,
      outlookEvents: [],
      updatedAt: new Date(),
    })
    .where(eq(workspaceSettings.organizationId, context.organization.id));

  await clearIntegrationHealth(context.organization.id, "outlook");
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/** Send a test email via Outlook. */
export async function testOutlookAction(): Promise<OutlookActionResult> {
  assertNotDemo();
  const context = await requirePermission("integrations:manage");
  const config = await getWorkspaceOutlookConfig(context.organization.id);
  if (!config) {
    return { ok: false, error: await unusableOutlookMessage(context.organization.id) };
  }

  try {
    await sendMail(config.accessToken, {
      to: [context.user.email ?? ""],
      subject: "Test from Harly",
      body: "<p>Your Microsoft Outlook integration is working!</p>",
    });
    await recordIntegrationSuccess(context.organization.id, "outlook");
    return { ok: true };
  } catch (err) {
    log.error(err, "testOutlookAction failed");
    if (await recordOutlookCallFailure(context.organization.id, err)) {
      return { ok: false, error: RECONNECT_MESSAGE };
    }
    return { ok: false, error: sanitizeIntegrationError(err) };
  }
}
