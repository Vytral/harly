"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { createLogger } from "@/lib/logger";
import { getWorkspaceOutlookConfig } from "@/lib/outlook/config";
import { listCalendars, sendMail } from "@/lib/outlook/client";
import { isWebhookEvent } from "@/server/webhooks/events";

const log = createLogger("workspace-outlook-settings");

export type OutlookActionResult = { ok: boolean; error?: string };

const SETTINGS_PATH = "/settings/integrations";

export type OutlookCalendarItem = { id: string; name: string };

/** Save Outlook App credentials (Client ID + Secret) for this workspace. */
export async function saveOutlookCredentialsAction(input: {
  clientId: string;
  clientSecret: string;
}): Promise<OutlookActionResult> {
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
  const context = await requirePermission("integrations:manage");
  const config = await getWorkspaceOutlookConfig(context.organization.id);
  if (!config) return { ok: false, error: "Outlook not connected." };

  try {
    const calendars = await listCalendars(config.accessToken);
    return {
      ok: true,
      calendars: calendars.map((c) => ({ id: c.id, name: c.name })),
    };
  } catch (error) {
    log.error(error, "listOutlookCalendarsAction failed");
    return { ok: false, error: "Failed to fetch calendars from Outlook." };
  }
}

/** Save the selected calendar and events. */
export async function saveOutlookSettingsAction(input: {
  calendarId: string;
  events: string[];
  enabled: boolean;
}): Promise<OutlookActionResult> {
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

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/** Send a test email via Outlook. */
export async function testOutlookAction(): Promise<OutlookActionResult> {
  const context = await requirePermission("integrations:manage");
  const config = await getWorkspaceOutlookConfig(context.organization.id);
  if (!config) return { ok: false, error: "Outlook not connected." };

  try {
    await sendMail(config.accessToken, {
      to: [context.user.email ?? ""],
      subject: "Test from Harly",
      body: "<p>Your Microsoft Outlook integration is working!</p>",
    });
    return { ok: true };
  } catch (err) {
    log.error(err, "testOutlookAction failed");
    const msg = err instanceof Error ? err.message : "Send failed";
    return { ok: false, error: msg };
  }
}
