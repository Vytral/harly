import "server-only";

import { eq } from "drizzle-orm";
import { OAuth2Client } from "google-auth-library";

import { db, workspaceSettings } from "@harly/db";

import { decryptSecret, isEncryptionConfigured } from "@/lib/crypto";

export type WorkspaceGCalStatus = {
  enabled: boolean;
  accountEmail: string | null;
  calendarId: string | null;
  hasRefreshToken: boolean;
  hasCredentials: boolean;
  encryptionReady: boolean;
};

export type GCalConfig = {
  oauth2Client: OAuth2Client;
  calendarId: string;
};

/** Mark a revoked OAuth connection unusable without touching the account label. */
export async function invalidateWorkspaceGCalConnection(
  workspaceId: string,
): Promise<void> {
  await db
    .update(workspaceSettings)
    .set({
      gcalEnabled: false,
      gcalRefreshTokenCiphertext: null,
      gcalRefreshTokenIv: null,
      gcalRefreshTokenTag: null,
      updatedAt: new Date(),
    })
    .where(eq(workspaceSettings.organizationId, workspaceId));
}

function getGoogleCredentials(): {
  clientId: string;
  clientSecret: string;
} | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function getRedirectUri(): string {
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");
  return `${appUrl}/api/integrations/google/callback`;
}

export function createOAuth2Client(): OAuth2Client | null {
  const creds = getGoogleCredentials();
  if (!creds) return null;
  return new OAuth2Client(creds.clientId, creds.clientSecret, getRedirectUri());
}

export async function getWorkspaceGCalStatus(
  workspaceId: string,
): Promise<WorkspaceGCalStatus> {
  const [row] = await db
    .select({
      gcalEnabled: workspaceSettings.gcalEnabled,
      gcalAccountEmail: workspaceSettings.gcalAccountEmail,
      gcalCalendarId: workspaceSettings.gcalCalendarId,
      gcalRefreshTokenCiphertext:
        workspaceSettings.gcalRefreshTokenCiphertext,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  return {
    enabled: Boolean(row?.gcalEnabled),
    accountEmail: row?.gcalAccountEmail ?? null,
    calendarId: row?.gcalCalendarId ?? null,
    hasRefreshToken: Boolean(row?.gcalRefreshTokenCiphertext),
    hasCredentials: Boolean(getGoogleCredentials()),
    encryptionReady: isEncryptionConfigured(),
  };
}

export async function getWorkspaceGCalConfig(
  workspaceId: string,
): Promise<GCalConfig | null> {
  if (!isEncryptionConfigured()) return null;

  const creds = getGoogleCredentials();
  if (!creds) return null;

  const [row] = await db
    .select({
      gcalEnabled: workspaceSettings.gcalEnabled,
      gcalCalendarId: workspaceSettings.gcalCalendarId,
      gcalRefreshTokenCiphertext:
        workspaceSettings.gcalRefreshTokenCiphertext,
      gcalRefreshTokenIv: workspaceSettings.gcalRefreshTokenIv,
      gcalRefreshTokenTag: workspaceSettings.gcalRefreshTokenTag,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  if (
    !row ||
    !row.gcalEnabled ||
    !row.gcalRefreshTokenCiphertext ||
    !row.gcalRefreshTokenIv ||
    !row.gcalRefreshTokenTag
  ) {
    return null;
  }

  try {
    const refreshToken = decryptSecret({
      ciphertext: row.gcalRefreshTokenCiphertext,
      iv: row.gcalRefreshTokenIv,
      tag: row.gcalRefreshTokenTag,
    });

    const oauth2Client = new OAuth2Client(
      creds.clientId,
      creds.clientSecret,
      getRedirectUri(),
    );
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    return {
      oauth2Client,
      calendarId: row.gcalCalendarId ?? "primary",
    };
  } catch {
    return null;
  }
}
