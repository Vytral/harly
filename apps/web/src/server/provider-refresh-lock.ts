import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@harly/db";

/** Transaction handle passed to the critical section. */
export type RefreshTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const LOCK_NAMESPACE = "harly:provider-refresh";

/**
 * Run `critical` while holding a Postgres advisory lock for one workspace and
 * provider. The lock is shared by every process that uses this database, so
 * two web or worker processes cannot exchange the same rotating refresh token
 * at the same time. It is transaction-scoped: released on commit or rollback.
 *
 * The critical section must re-read the stored tokens itself, because the
 * previous holder may have rotated them while this caller waited.
 */
export async function withProviderRefreshLock<T>(
  workspaceId: string,
  provider: "zoom" | "outlook",
  critical: (tx: RefreshTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${LOCK_NAMESPACE}), hashtext(${`${workspaceId}:${provider}`}))`,
    );
    return critical(tx);
  });
}
