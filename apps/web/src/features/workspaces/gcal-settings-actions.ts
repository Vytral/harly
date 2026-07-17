"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { getWorkspaceGCalConfig } from "@/lib/gcal/config";
import { listCalendars } from "@/lib/gcal/client";
import { createLogger } from "@/lib/logger";

const log = createLogger("workspace-gcal-settings");

export type GCalActionResult = { ok: boolean; error?: string };

const SETTINGS_PATH = "/settings/integrations";

export type GCalCalendar = { id: string; name: string; primary: boolean };

const RECONNECT_MESSAGE =
  "Google revoked this connection. Disconnect and reconnect Google Calendar.";

/** True when Google rejected the stored refresh token (revoked/expired). */
function isInvalidGrant(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("invalid_grant");
}

/** Wipe the dead token so status flips back to "not connected". */
async function clearGCalToken(organizationId: string): Promise<void> {
  await db
    .update(workspaceSettings)
    .set({
      gcalEnabled: false,
      gcalRefreshTokenCiphertext: null,
      gcalRefreshTokenIv: null,
      gcalRefreshTokenTag: null,
      updatedAt: new Date(),
    })
    .where(eq(workspaceSettings.organizationId, organizationId));
  revalidatePath(SETTINGS_PATH);
}

/** List writable calendars for the connected Google account. */
export async function listGCalCalendarsAction(): Promise<
  { ok: true; calendars: GCalCalendar[] } | { ok: false; error: string }
> {
  const context = await requirePermission("integrations:manage");
  const config = await getWorkspaceGCalConfig(context.organization.id);
  if (!config) {
    return { ok: false, error: "Google Calendar not connected." };
  }

  try {
    const calendars = await listCalendars(config.oauth2Client);
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
    if (isInvalidGrant(err)) {
      await clearGCalToken(context.organization.id);
      return { ok: false, error: RECONNECT_MESSAGE };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to list calendars.",
    };
  }
}

/** Save the selected calendar ID. */
export async function saveGCalSettingsAction(input: {
  calendarId: string;
}): Promise<GCalActionResult> {
  const context = await requirePermission("integrations:manage");
  const calendarId = input.calendarId.trim();

  if (!calendarId) {
    return { ok: false, error: "Calendar ID is required." };
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

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/** Quick connectivity check , tries to list calendars. */
export async function testGCalConnectionAction(): Promise<GCalActionResult> {
  const context = await requirePermission("integrations:manage");
  const config = await getWorkspaceGCalConfig(context.organization.id);
  if (!config) {
    return { ok: false, error: "Google Calendar not connected." };
  }

  try {
    await listCalendars(config.oauth2Client);
    return { ok: true };
  } catch (err) {
    log.error(err, "testGCalConnectionAction failed");
    if (isInvalidGrant(err)) {
      await clearGCalToken(context.organization.id);
      return { ok: false, error: RECONNECT_MESSAGE };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Connection test failed.",
    };
  }
}
