/**
 * The Outlook access token is stored encrypted in `outlook_access_token_*`.
 * Its expiry travels inside that same encrypted value, so refreshes can skip
 * the network while the token is still valid, without a new column. Rows
 * written before this envelope hold a bare token; they read as expiry-unknown
 * and are refreshed once, which rewrites them in the envelope.
 */

const ENVELOPE_VERSION = 1;

export type StoredOutlookAccessToken = {
  accessToken: string;
  /** null when the stored value predates the envelope. */
  expiresAt: Date | null;
};

export function sealOutlookAccessToken(accessToken: string, expiresAt: Date | null): string {
  return JSON.stringify({
    v: ENVELOPE_VERSION,
    accessToken,
    expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt.toISOString() : null,
  });
}

export function openOutlookAccessToken(plaintext: string): StoredOutlookAccessToken {
  try {
    const parsed = JSON.parse(plaintext) as { v?: unknown; accessToken?: unknown; expiresAt?: unknown };
    if (parsed?.v === ENVELOPE_VERSION && typeof parsed.accessToken === "string") {
      const expiresAt = typeof parsed.expiresAt === "string" ? new Date(parsed.expiresAt) : null;
      return {
        accessToken: parsed.accessToken,
        expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
      };
    }
  } catch {
    // Not JSON: a bare token from before the envelope existed.
  }
  return { accessToken: plaintext, expiresAt: null };
}

/** Refresh when the token expires within this window, or when its expiry is unknown. */
export const OUTLOOK_REFRESH_SKEW_MS = 5 * 60_000;

export function outlookTokenNeedsRefresh(expiresAt: Date | null, now: Date = new Date()): boolean {
  if (!expiresAt) return true;
  return expiresAt.getTime() - now.getTime() <= OUTLOOK_REFRESH_SKEW_MS;
}
