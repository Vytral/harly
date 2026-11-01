import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The host-side updater authenticates to the app with a token derived from
 * `CRON_SECRET`, not with `CRON_SECRET` itself.
 *
 * Why derived, and not a new env var: the updater already has to read this
 * install's `.env`, `CRON_SECRET` is mandatory in every deployment, and an
 * existing install gets the feature with no new configuration. Why not the raw
 * secret: it also authorizes every cron endpoint and lives in the app and
 * scheduler containers. A domain-separated HMAC means a leaked cron request
 * cannot pose as the updater, and the updater token cannot be turned back into
 * the cron secret. The CLI derives the same value (tooling/harly/src/updater.ts);
 * both sides are pinned to the same test vector.
 */
const CONTEXT = "harly:updater:v1";

export function deriveUpdaterToken(cronSecret: string): string {
  return createHmac("sha256", cronSecret).update(CONTEXT).digest("hex");
}

export function isValidUpdaterToken(
  supplied: string | null | undefined,
  cronSecret: string | undefined,
): boolean {
  if (!supplied || !cronSecret) return false;
  const expected = Buffer.from(deriveUpdaterToken(cronSecret));
  const actual = Buffer.from(supplied);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
