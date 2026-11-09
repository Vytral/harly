"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { assertNotDemo } from "@/features/demo/assert-not-demo";
import {
  clearIntegrationHealth,
  recordIntegrationSuccess,
} from "@/features/integrations/health/repository";
import { sanitizeIntegrationError } from "@/features/integrations/health/model";
import {
  getWorkspaceGCalConfig,
  invalidateWorkspaceGCalConnection,
  recordGCalCallFailure,
} from "@/lib/gcal/config";
import { listCalendars } from "@/lib/gcal/client";
import { createLogger } from "@/lib/logger";
import { getTranslations } from "@/i18n/server";

const log = createLogger("workspace-gcal-settings");

export type GCalActionResult = { ok: boolean; error?: string };

const SETTINGS_PATH = "/settings/integrations";

export type GCalCalendar = { id: string; name: string; primary: boolean };

type Translate = (key: string, values?: Record<string, string | number>) => string;


/** True when Google rejected the stored refresh token (revoked/expired). */
function isInvalidGrant(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("invalid_grant");
}

/** True when the deployment's Google OAuth client configuration is invalid. */
function isInvalidClient(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("invalid_client");
}

function googleAuthFailureMessage(err: unknown, t: Translate): string | null {
  if (isInvalidClient(err)) return t("invalidClient");
  if (isInvalidGrant(err)) return t("revokedReconnect");
  return null;
}

/**
 * Google rejected the grant: clear the dead token (same as a background sync
 * failure), keep the enabled intent, and record the reason for the UI.
 */
async function clearGCalToken(organizationId: string, error: unknown): Promise<void> {
  await invalidateWorkspaceGCalConnection(organizationId, error);
  revalidatePath(SETTINGS_PATH);
}

/** List writable calendars for the connected Google account. */
export async function listGCalCalendarsAction(): Promise<
  { ok: true; calendars: GCalCalendar[] } | { ok: false; error: string }
> {
  assertNotDemo();
  const context = await requirePermission("integrations:manage");
  const t = await getTranslations("server.workspaces.gcalSettingsActions");
  const config = await getWorkspaceGCalConfig(context.organization.id);
  if (!config) {
    return { ok: false, error: t("notConnected") };
  }

  try {
    const calendars = await listCalendars(config.oauth2Client);
    await recordIntegrationSuccess(context.organization.id, "gcal");
    return {
      ok: true,
      calendars: calendars.map((c) => ({
        id: c.id,
        name: c.summary,
        primary: Boolean(c.primary),
      })),
    };
  } catch (err) {
    log.error(err, "listGCalCalendarsAction failed");
    const authFailure = googleAuthFailureMessage(err, t);
    if (authFailure) {
      await clearGCalToken(context.organization.id, err);
      return { ok: false, error: authFailure };
    }
    await recordGCalCallFailure(context.organization.id, err);
    return { ok: false, error: sanitizeIntegrationError(err) };
  }
}

/** Save the selected calendar ID. */
export async function saveGCalSettingsAction(input: {
  calendarId: string;
}): Promise<GCalActionResult> {
  assertNotDemo();
  const context = await requirePermission("integrations:manage");
  const t = await getTranslations("server.workspaces.gcalSettingsActions");
  const calendarId = input.calendarId.trim();

  if (!calendarId) {
    return { ok: false, error: t("calendarIdRequired") };
  }

  await db
    .update(workspaceSettings)
    .set({ gcalCalendarId: calendarId, updatedAt: new Date() })
    .where(eq(workspaceSettings.organizationId, context.organization.id));

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/** Disconnect Google Calendar , clear all gcal columns. */
export async function disconnectGCalAction(): Promise<GCalActionResult> {
  assertNotDemo();
  const context = await requirePermission("integrations:manage");

  // Attempt to revoke the token at Google's end (best-effort)
  const config = await getWorkspaceGCalConfig(context.organization.id);
  if (config) {
    try {
      await config.oauth2Client.revokeCredentials();
    } catch (error) {
      log.error(error, "disconnectGCalAction revoke failed");
    }
  }

  await db
    .update(workspaceSettings)
    .set({
      gcalEnabled: false,
      gcalAccountEmail: null,
      gcalCalendarId: null,
      gcalRefreshTokenCiphertext: null,
      gcalRefreshTokenIv: null,
      gcalRefreshTokenTag: null,
      updatedAt: new Date(),
    })
    .where(eq(workspaceSettings.organizationId, context.organization.id));

  await clearIntegrationHealth(context.organization.id, "gcal");
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/** Quick connectivity check , tries to list calendars. */
export async function testGCalConnectionAction(): Promise<GCalActionResult> {
  assertNotDemo();
  const context = await requirePermission("integrations:manage");
  const t = await getTranslations("server.workspaces.gcalSettingsActions");
  const config = await getWorkspaceGCalConfig(context.organization.id);
  if (!config) {
    return { ok: false, error: t("notConnected") };
  }

  try {
    await listCalendars(config.oauth2Client);
    await recordIntegrationSuccess(context.organization.id, "gcal");
    return { ok: true };
  } catch (err) {
    log.error(err, "testGCalConnectionAction failed");
    const authFailure = googleAuthFailureMessage(err, t);
    if (authFailure) {
      await clearGCalToken(context.organization.id, err);
      return { ok: false, error: authFailure };
    }
    await recordGCalCallFailure(context.organization.id, err);
    return { ok: false, error: sanitizeIntegrationError(err) };
  }
}
