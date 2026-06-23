"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { getWorkspaceGCalConfig } from "@/lib/gcal/config";
import { listCalendars } from "@/lib/gcal/client";

export type GCalActionResult = { ok: boolean; error?: string };

const SETTINGS_PATH = "/settings/integrations";

export type GCalCalendar = { id: string; name: string; primary: boolean };

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

/** Disconnect Google Calendar — clear all gcal columns. */
export async function disconnectGCalAction(): Promise<GCalActionResult> {
  const context = await requirePermission("integrations:manage");

  // Attempt to revoke the token at Google's end (best-effort)
  const config = await getWorkspaceGCalConfig(context.organization.id);
  if (config) {
    try {
      await config.oauth2Client.revokeCredentials();
    } catch {
      // Non-critical
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

/** Quick connectivity check — tries to list calendars. */
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
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Connection test failed.",
    };
  }
}
