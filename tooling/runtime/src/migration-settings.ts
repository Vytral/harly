/**
 * How long a single DDL statement may wait for a table lock before the
 * migration fails (Postgres `lock_timeout`). Without a bound, an ALTER TABLE
 * queued behind a long-running transaction also blocks every query that
 * arrives after it on that table, which turns a routine upgrade into an
 * outage. Failing fast leaves the database untouched (migrations run in one
 * transaction) so the operator can simply retry in a quieter moment.
 */
export const DEFAULT_MIGRATION_LOCK_TIMEOUT_MS = 30_000;

export function migrationLockTimeoutMs(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.HARLY_MIGRATION_LOCK_TIMEOUT_MS;
  if (raw === undefined || raw.trim() === "") return DEFAULT_MIGRATION_LOCK_TIMEOUT_MS;
  const parsed = Number(raw);
  // 0 disables the timeout (Postgres semantics); anything else must be a whole number.
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(
      `HARLY_MIGRATION_LOCK_TIMEOUT_MS must be a non-negative integer (milliseconds). Received "${raw}".`,
    );
  }
  return parsed;
}
