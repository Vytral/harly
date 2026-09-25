import "server-only";

import { and, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";

import { db, workflowRuns } from "@harly/db";

const WORKFLOW_LEASE_MS = 5 * 60_000;

/**
 * Read due v1/v2 runs without claiming them. The caller owns the subsequent
 * fenced claim; this module only defines the durable wake predicates. Keeping
 * it independent from dispatch side effects gives recovery tests and future
 * scheduler adapters a small, explicit seam.
 */
export async function findDueWorkflowRuns(
  database: typeof db = db,
  limit = 50,
): Promise<Array<{ id: string; engineVersion: number; workspaceId: string; workflowId: string; logicalStatus: string | null }>> {
  const now = new Date();
  return database
    .select({
      id: workflowRuns.id,
      engineVersion: workflowRuns.engineVersion,
      workspaceId: workflowRuns.workspaceId,
      workflowId: workflowRuns.workflowId,
      logicalStatus: workflowRuns.logicalStatus,
    })
    .from(workflowRuns)
    .where(
      and(
        // Document/package completion is a durable wake condition. The
        // callback is best-effort; the scheduler must still discover it if
        // that callback was lost after the domain transaction committed.
        or(
          lte(workflowRuns.nextAttemptAt, now),
          and(
            eq(workflowRuns.engineVersion, 2),
            eq(workflowRuns.logicalStatus, "waiting"),
            sql`exists (
              select 1 from "workflow_node_executions" executions
              where executions."run_id" = ${workflowRuns.id}
                and executions."workspace_id" = ${workflowRuns.workspaceId}
                and executions."status" = 'waiting'
                and executions."waiting_kind" = 'document_package'
                and (
                  (
                    coalesce(executions."waiting_resource_type", 'package') = 'package'
                    and exists (
                      select 1 from "document_request_packages" packages
                      where packages."id"::text = executions."waiting_resource_id"
                        and packages."workspace_id" = executions."workspace_id"
                        and packages."status" in ('completed', 'declined', 'expired', 'cancelled')
                    )
                  )
                  or (
                    (executions."waiting_resource_type" = 'document' or executions."waiting_resource_type" is null)
                    and exists (
                      select 1 from "documents" signed_documents
                      where signed_documents."id"::text = executions."waiting_resource_id"
                        and signed_documents."workspace_id" = executions."workspace_id"
                        and signed_documents."signature_status" in ('signed', 'declined', 'expired')
                    )
                  )
                )
            )`,
          ),
        ),
        or(
          and(
            eq(workflowRuns.engineVersion, 1),
            sql`${workflowRuns.status} = 'running'`,
            or(
              isNull(workflowRuns.lockedAt),
              lt(workflowRuns.lockedAt, new Date(now.getTime() - WORKFLOW_LEASE_MS)),
            ),
          ),
          and(
            eq(workflowRuns.engineVersion, 2),
            inArray(workflowRuns.logicalStatus, ["queued", "retrying", "running", "waiting"]),
            or(isNull(workflowRuns.leaseUntil), lt(workflowRuns.leaseUntil, now)),
          ),
        ),
      ),
    )
    .orderBy(workflowRuns.nextAttemptAt)
    .limit(limit);
}
