import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { workflowRuns, workflowDefinitionVersions, workflowNodeExecutions, type db } from "@harly/db";
import { compileGraph } from "../definition/compile";
import { jsonValueSchema } from "../definition/schema-v2";
import { advance, type AdvanceDecision, type ExecutionSnapshot, type NodeOutcome } from "./advance";
import { graphRunLeases, type RunLease } from "./leases";

/** Reconstruct from persisted evidence, then commit one graph transition. */
export function graphRunStore(database: Pick<typeof db, "transaction">) {
  return {
    async advance(lease: RunLease): Promise<AdvanceDecision | null> {
      return database.transaction(async (tx) => {
        if (!await graphRunLeases(tx).renew(lease)) return null;
        const [row] = await tx.select({ run: workflowRuns, version: workflowDefinitionVersions })
          .from(workflowRuns).innerJoin(workflowDefinitionVersions, and(
            eq(workflowDefinitionVersions.id, workflowRuns.versionId),
            eq(workflowDefinitionVersions.workspaceId, workflowRuns.workspaceId),
            eq(workflowDefinitionVersions.workflowId, workflowRuns.workflowId),
          )).where(eq(workflowRuns.id, lease.runId));
        if (!row) return null;
        const finish = async (decision: Extract<AdvanceDecision, { type: "finish" }>) => {
          const legacyStatus = decision.status === "stopped" ? "skipped"
            : decision.status === "completed_with_warnings" ? "succeeded"
            : decision.status === "uncertain" ? "failed" : decision.status;
          const [updated] = await tx.update(workflowRuns).set({
            logicalStatus: decision.status, status: legacyStatus, error: decision.code ?? null,
            finishedAt: sql`clock_timestamp()`, updatedAt: sql`clock_timestamp()`,
            lockedBy: null, lockedAt: null, leaseUntil: null, heartbeatAt: null, retryNodeId: null,
          }).where(and(
            eq(workflowRuns.workspaceId, lease.workspaceId),
            eq(workflowRuns.id, lease.runId),
            eq(workflowRuns.engineVersion, 2),
            eq(workflowRuns.logicalStatus, "running"),
            eq(workflowRuns.lockedBy, lease.workerId),
            eq(workflowRuns.fenceToken, lease.fenceToken),
            gt(workflowRuns.leaseUntil, sql`clock_timestamp()`),
          )).returning({ id: workflowRuns.id });
          return updated ? decision : null;
        };
        const compiled = compileGraph(row.version.graph);
        if (!compiled.ok || compiled.plan.contentHash !== row.version.contentHash || row.version.schemaVersion !== 2 || !row.version.publishedAt) {
          return finish({ type: "finish", status: "failed", code: "INVALID_PUBLISHED_VERSION" });
        }
        if (!row.run.cursorNodeId) return finish({ type: "finish", status: "failed", code: "MISSING_DURABLE_CURSOR" });
        const context = jsonValueSchema.safeParse(row.run.contextSnapshot);
        if (!context.success || context.data === null) return finish({ type: "finish", status: "failed", code: "MISSING_CONTEXT_SNAPSHOT" });
        const executions = await tx.select().from(workflowNodeExecutions).where(and(
          eq(workflowNodeExecutions.workspaceId, lease.workspaceId), eq(workflowNodeExecutions.runId, lease.runId),
        ));
        const outcomes: Record<string, NodeOutcome> = Object.create(null);
        const warnings: string[] = [];
        for (const execution of executions) {
          if (execution.status === "succeeded") {
            const output = jsonValueSchema.safeParse(execution.output);
            if (!output.success) return finish({ type: "finish", status: "failed", code: "INVALID_PERSISTED_OUTPUT" });
            outcomes[execution.nodeId] = { status: "succeeded", output: output.data, port: execution.resolvedPort ?? undefined };
          } else if (execution.status === "failed" || execution.status === "uncertain") {
            outcomes[execution.nodeId] = {
              status: execution.status,
              code: execution.errorCode ?? "NODE_FAILED",
              ...(execution.status === "failed" && execution.retryable ? { retryable: true } : {}),
            };
            const node = compiled.plan.nodesById[execution.nodeId];
            if (execution.status === "failed" && node?.type === "action" && node.failurePolicy === "continue") warnings.push(execution.nodeId);
          }
        }
        const snapshot: ExecutionSnapshot = {
          contentHash: row.version.contentHash, nodeId: row.run.cursorNodeId,
          trigger: context.data, outcomes, warnings,
          cancelled: Boolean(row.run.cancelRequestedAt),
          retryNodeId: row.run.retryNodeId,
        };
        const decision = advance(compiled.plan, snapshot);
        if (decision.type === "finish") return finish(decision);
        if (decision.type === "next") {
          await tx.update(workflowRuns).set({ retryNodeId: null, cursorNodeId: decision.nodeId, updatedAt: sql`clock_timestamp()` })
            .where(and(
              eq(workflowRuns.workspaceId, lease.workspaceId),
              eq(workflowRuns.id, lease.runId),
              eq(workflowRuns.engineVersion, 2),
              eq(workflowRuns.logicalStatus, "running"),
              eq(workflowRuns.lockedBy, lease.workerId),
              eq(workflowRuns.fenceToken, lease.fenceToken),
              gt(workflowRuns.leaseUntil, sql`clock_timestamp()`),
              isNull(workflowRuns.cancelRequestedAt),
            ));
        }
        // Effects/waits/conditions are requests, not completed work.
        return decision;
      });
    },
    /** Move failed retryable node back to queue without deleting attempts. */
    async scheduleRetry(lease: RunLease, delayMs: number, code: string): Promise<boolean> {
      const boundedDelay = Math.max(0, Math.min(delayMs, 24 * 60 * 60 * 1000));
      return database.transaction(async (tx) => {
        if (!await graphRunLeases(tx).renew(lease)) return false;
        const [updated] = await tx.update(workflowRuns).set({
          logicalStatus: "retrying",
          status: "running",
          retryNodeId: sql`${workflowRuns.cursorNodeId}`,
          nextAttemptAt: sql`clock_timestamp() + (${boundedDelay} * interval '1 millisecond')`,
          error: code,
          lockedBy: null,
          lockedAt: null,
          leaseUntil: null,
          heartbeatAt: null,
          updatedAt: sql`clock_timestamp()`,
        }).where(and(
          eq(workflowRuns.workspaceId, lease.workspaceId),
          eq(workflowRuns.id, lease.runId),
          eq(workflowRuns.engineVersion, 2),
          eq(workflowRuns.logicalStatus, "running"),
          eq(workflowRuns.lockedBy, lease.workerId),
          eq(workflowRuns.fenceToken, lease.fenceToken),
        )).returning({ id: workflowRuns.id });
        return Boolean(updated);
      });
    },
    /** Persist an operational failure instead of leaving an exhausted run leased. */
    async fail(lease: RunLease, code: string): Promise<boolean> {
      return database.transaction(async (tx) => {
        if (!await graphRunLeases(tx).renew(lease)) return false;
        const [updated] = await tx.update(workflowRuns).set({
          logicalStatus: "failed",
          status: "failed",
          error: code,
          finishedAt: sql`clock_timestamp()`,
          lockedBy: null,
          lockedAt: null,
          leaseUntil: null,
          heartbeatAt: null,
          updatedAt: sql`clock_timestamp()`,
        }).where(and(
          eq(workflowRuns.workspaceId, lease.workspaceId),
          eq(workflowRuns.id, lease.runId),
          eq(workflowRuns.engineVersion, 2),
          eq(workflowRuns.logicalStatus, "running"),
          eq(workflowRuns.lockedBy, lease.workerId),
          eq(workflowRuns.fenceToken, lease.fenceToken),
        )).returning({ id: workflowRuns.id });
        return Boolean(updated);
      });
    },
  };
}
