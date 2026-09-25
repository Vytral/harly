import "server-only";

import { sql, type SQLWrapper } from "drizzle-orm";

type TransactionWithExecute = {
  execute?: (query: string | SQLWrapper) => unknown;
};

/**
 * Serializes max+1 allocation for a workspace/stage without a schema change.
 * PostgreSQL releases this advisory lock automatically when the transaction
 * commits or rolls back. Minimal unit-test doubles may omit execute.
 */
export async function lockApplicationPipelineOrder(
  tx: TransactionWithExecute,
  workspaceId: string,
  stageId: string,
): Promise<void> {
  if (typeof tx.execute !== "function") return;

  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`${workspaceId}:${stageId}`}, 0))`,
  );
}
