import "server-only";

import { sql, type SQL } from "drizzle-orm";

type TransactionExecutor = {
  execute(query: SQL): Promise<unknown> | unknown;
};

/**
 * Serialize interview writes for one interviewer without holding a row lock on
 * an arbitrary existing interview. The lock lives for the surrounding DB
 * transaction and is shared by dashboard and REST writes.
 *
 * This is an application guard for the current no-schema batch. A database
 * exclusion constraint can provide an additional invariant later, but must be
 * introduced deliberately because it needs a range expression and btree_gist.
 */
export async function lockInterviewerSchedule(
  tx: TransactionExecutor,
  workspaceId: string,
  interviewerId: string,
): Promise<void> {
  const lockKey = `${workspaceId}:${interviewerId}`;
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
  );
}
