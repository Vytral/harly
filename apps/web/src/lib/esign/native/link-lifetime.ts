const DEFAULT_EXPIRATION_DAYS = 30;
/** Shortest link lifetime we accept, so a signer always gets a workable window. */
export const MIN_EXPIRATION_DAYS = 3;
export const MAX_EXPIRATION_DAYS = 365;
export const DAY_MS = 86_400_000;

/** Days a signer's link works, counted from when THAT signer is invited. */
export function linkLifetimeDays(envelopeDays: number | null | undefined, workspaceDays: number | null | undefined) {
  const wanted = envelopeDays ?? workspaceDays ?? DEFAULT_EXPIRATION_DAYS;
  return Math.max(MIN_EXPIRATION_DAYS, Math.min(wanted || DEFAULT_EXPIRATION_DAYS, MAX_EXPIRATION_DAYS));
}
