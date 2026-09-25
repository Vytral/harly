import { and, eq, lt, lte, max, or, sql } from "drizzle-orm";
import {
  documentRequestPackages,
  documents,
  domainEventOutbox,
  workflowRuns,
  workflowNodeExecutions,
  workflowNodeAttempts,
  type db,
} from "@harly/db";
import { jsonValueSchema, type JsonValue } from "../definition/schema-v2";
import type { NodeOutcome } from "./advance";
import { graphRunLeases, type RunLease } from "./leases";

/** Short transactions only. Provider calls must occur after reserve commits. */
export function graphNodeStore(database: Pick<typeof db, "transaction">) {
  return {
    async reserve(
      lease: RunLease,
      nodeId: string,
      input: Record<string, JsonValue>,
      options: { retry?: boolean } = {},
    ) {
      const inputSnapshot = jsonValueSchema.parse(input);
      return database.transaction(async (tx) => {
        // UPDATE acquires the run row lock, serializing with cancel/reclaim.
        if (!(await graphRunLeases(tx).renew(lease))) return null;
        const [run] = await tx
          .select({ cursor: workflowRuns.cursorNodeId })
          .from(workflowRuns)
          .where(eq(workflowRuns.id, lease.runId));
        if (run?.cursor !== nodeId) return null;
        const effectKey = `workflow:${lease.runId}:node:${nodeId}`;
        const [created] = await tx
          .insert(workflowNodeExecutions)
          .values({
            workspaceId: lease.workspaceId,
            runId: lease.runId,
            nodeId,
            status: "running",
            effectKey,
            inputSnapshot,
            startedAt: sql`clock_timestamp()`,
          })
          .onConflictDoNothing({
            target: [
              workflowNodeExecutions.runId,
              workflowNodeExecutions.nodeId,
            ],
          })
          .returning();
        if (!created) {
          const [existing] = await tx
            .select()
            .from(workflowNodeExecutions)
            .where(
              and(
                eq(workflowNodeExecutions.workspaceId, lease.workspaceId),
                eq(workflowNodeExecutions.runId, lease.runId),
                eq(workflowNodeExecutions.nodeId, nodeId),
              ),
            );
          if (!existing) return null;
          // A completed effect is replay-safe. A running/uncertain effect is
          // never permission to call provider again. Only explicit retry of a
          // known failed result may create a new attempt.
          if (options.retry && existing.status === "failed") {
            const [last] = await tx
              .select({ attemptNo: max(workflowNodeAttempts.attemptNo) })
              .from(workflowNodeAttempts)
              .where(eq(workflowNodeAttempts.executionId, existing.id));
            const [attempt] = await tx
              .insert(workflowNodeAttempts)
              .values({
                workspaceId: lease.workspaceId,
                executionId: existing.id,
                attemptNo: Number(last?.attemptNo ?? 0) + 1,
                fenceToken: lease.fenceToken,
                status: "running",
              })
              .returning({
                id: workflowNodeAttempts.id,
                attemptNo: workflowNodeAttempts.attemptNo,
              });
            const [updated] = await tx
              .update(workflowNodeExecutions)
              .set({
                status: "running",
                errorCode: null,
                retryable: false,
                output: null,
                resolvedPort: null,
                finishedAt: null,
                updatedAt: sql`clock_timestamp()`,
              })
              .where(
                and(
                  eq(workflowNodeExecutions.id, existing.id),
                  eq(workflowNodeExecutions.status, "failed"),
                ),
              )
              .returning();
            return attempt && updated
              ? {
                  kind: "reserved" as const,
                  execution: updated,
                  attemptId: attempt.id,
                  attemptNo: attempt.attemptNo,
                }
              : { kind: "existing" as const, execution: existing };
          }
          return { kind: "existing" as const, execution: existing };
        }
        const [attempt] = await tx
          .insert(workflowNodeAttempts)
          .values({
            workspaceId: lease.workspaceId,
            executionId: created.id,
            attemptNo: 1,
            fenceToken: lease.fenceToken,
            status: "running",
          })
          .returning({
            id: workflowNodeAttempts.id,
            attemptNo: workflowNodeAttempts.attemptNo,
          });
        return {
          kind: "reserved" as const,
          execution: created,
          attemptId: attempt!.id,
          attemptNo: attempt!.attemptNo,
        };
      });
    },
    async settle(
      lease: RunLease,
      executionId: string,
      attemptId: string,
      outcome: NodeOutcome,
    ): Promise<boolean> {
      const output =
        outcome.status === "succeeded"
          ? jsonValueSchema.parse(outcome.output)
          : null;
      return database.transaction(async (tx) => {
        if (!(await graphRunLeases(tx).renew(lease))) return false;
        const [execution] = await tx
          .select()
          .from(workflowNodeExecutions)
          .where(
            and(
              eq(workflowNodeExecutions.id, executionId),
              eq(workflowNodeExecutions.runId, lease.runId),
              eq(workflowNodeExecutions.workspaceId, lease.workspaceId),
              eq(workflowNodeExecutions.status, "running"),
            ),
          );
        if (!execution) return false;
        const [attempt] = await tx
          .update(workflowNodeAttempts)
          .set({
            status: outcome.status,
            errorCode: outcome.status === "succeeded" ? null : outcome.code,
            errorDetails:
              outcome.status === "succeeded" ? null : outcome.details ?? null,
            providerRef:
              "providerRef" in outcome ? (outcome.providerRef ?? null) : null,
            finishedAt: sql`clock_timestamp()`,
          })
          .where(
            and(
              eq(workflowNodeAttempts.id, attemptId),
              eq(workflowNodeAttempts.executionId, executionId),
              eq(workflowNodeAttempts.workspaceId, lease.workspaceId),
              eq(workflowNodeAttempts.status, "running"),
              eq(workflowNodeAttempts.fenceToken, lease.fenceToken),
            ),
          )
          .returning({ id: workflowNodeAttempts.id });
        if (!attempt) return false;
        await tx
          .update(workflowNodeExecutions)
          .set({
            status: outcome.status,
            output,
            resolvedPort:
              outcome.status === "succeeded" ? (outcome.port ?? null) : null,
            errorCode: outcome.status === "succeeded" ? null : outcome.code,
            errorDetails:
              outcome.status === "succeeded" ? null : outcome.details ?? null,
            retryable:
              outcome.status === "failed"
                ? (outcome.retryable ?? false)
                : false,
            finishedAt: sql`clock_timestamp()`,
            updatedAt: sql`clock_timestamp()`,
          })
          .where(eq(workflowNodeExecutions.id, executionId));
        return true;
      });
    },
    /** Remove an action reservation only when no provider/internal effect ran. */
    async releaseUnstarted(
      lease: RunLease,
      executionId: string,
      attemptId: string,
    ): Promise<boolean> {
      return database.transaction(async (tx) => {
        if (!(await graphRunLeases(tx).renew(lease))) return false;
        const [attempt] = await tx
          .select({ id: workflowNodeAttempts.id })
          .from(workflowNodeAttempts)
          .where(
            and(
              eq(workflowNodeAttempts.id, attemptId),
              eq(workflowNodeAttempts.executionId, executionId),
              eq(workflowNodeAttempts.workspaceId, lease.workspaceId),
              eq(workflowNodeAttempts.status, "running"),
              eq(workflowNodeAttempts.fenceToken, lease.fenceToken),
            ),
          )
          .limit(1);
        const [execution] = await tx
          .select({ id: workflowNodeExecutions.id })
          .from(workflowNodeExecutions)
          .where(
            and(
              eq(workflowNodeExecutions.id, executionId),
              eq(workflowNodeExecutions.runId, lease.runId),
              eq(workflowNodeExecutions.workspaceId, lease.workspaceId),
              eq(workflowNodeExecutions.status, "running"),
            ),
          )
          .limit(1);
        if (!attempt || !execution) return false;
        await tx
          .delete(workflowNodeAttempts)
          .where(eq(workflowNodeAttempts.id, attempt.id));
        await tx
          .delete(workflowNodeExecutions)
          .where(eq(workflowNodeExecutions.id, execution.id));
        return true;
      });
    },
    /** Convert abandoned provider calls into explicit uncertainty. */
    async reconcileStale(lease: RunLease): Promise<number> {
      return database.transaction(async (tx) => {
        if (!(await graphRunLeases(tx).renew(lease))) return 0;
        const stale = await tx
          .select({
            executionId: workflowNodeExecutions.id,
            attemptId: workflowNodeAttempts.id,
          })
          .from(workflowNodeExecutions)
          .innerJoin(
            workflowNodeAttempts,
            eq(workflowNodeAttempts.executionId, workflowNodeExecutions.id),
          )
          .where(
            and(
              eq(workflowNodeExecutions.workspaceId, lease.workspaceId),
              eq(workflowNodeExecutions.runId, lease.runId),
              eq(workflowNodeExecutions.status, "running"),
              eq(workflowNodeAttempts.status, "running"),
              lt(workflowNodeAttempts.fenceToken, lease.fenceToken),
            ),
          );
        for (const row of stale) {
          await tx
            .update(workflowNodeAttempts)
            .set({
              status: "uncertain",
              errorCode: "WORKER_LOST_DURING_EFFECT",
              finishedAt: sql`clock_timestamp()`,
            })
            .where(
              and(
                eq(workflowNodeAttempts.id, row.attemptId),
                eq(workflowNodeAttempts.status, "running"),
              ),
            );
          await tx
            .update(workflowNodeExecutions)
            .set({
              status: "uncertain",
              errorCode: "WORKER_LOST_DURING_EFFECT",
              retryable: false,
              finishedAt: sql`clock_timestamp()`,
              updatedAt: sql`clock_timestamp()`,
            })
            .where(
              and(
                eq(workflowNodeExecutions.id, row.executionId),
                eq(workflowNodeExecutions.status, "running"),
              ),
            );
        }
        return stale.length;
      });
    },
    /** Atomically register a durable wait and release the run lease. */
    async registerWait(
      lease: RunLease,
      nodeId: string,
      input: Record<string, JsonValue>,
      wait: {
        kind: "delay" | "approval" | "event" | "document_package";
        eventName?: string;
        resourceId?: string;
        resourceType?: "package" | "document";
        deadlineAt: Date;
      },
    ): Promise<{
      status: "waiting" | "continue" | "rejected";
      eventCursor: number | null;
    }> {
      const inputSnapshot = jsonValueSchema.parse(input);
      return database.transaction(async (tx) => {
        if (!(await graphRunLeases(tx).renew(lease))) {
          return { status: "rejected", eventCursor: null };
        }
        const [runState] = await tx
          .select({ cursorNodeId: workflowRuns.cursorNodeId })
          .from(workflowRuns)
          .where(
            and(
              eq(workflowRuns.id, lease.runId),
              eq(workflowRuns.workspaceId, lease.workspaceId),
              eq(workflowRuns.lockedBy, lease.workerId),
              eq(workflowRuns.fenceToken, lease.fenceToken),
            ),
          )
          .limit(1);
        if (runState?.cursorNodeId !== nodeId) {
          return { status: "rejected", eventCursor: null };
        }

        const [existing] = await tx
          .select()
          .from(workflowNodeExecutions)
          .where(
            and(
              eq(workflowNodeExecutions.workspaceId, lease.workspaceId),
              eq(workflowNodeExecutions.runId, lease.runId),
              eq(workflowNodeExecutions.nodeId, nodeId),
            ),
          )
          .limit(1);
        if (existing?.status === "waiting") {
          await graphRunLeases(tx).release(lease, "waiting");
          return {
            status: "waiting",
            eventCursor: existing.waitingEventCursor,
          };
        }
        if (existing) {
          return {
            status: existing.status === "succeeded" ? "continue" : "rejected",
            eventCursor: existing.waitingEventCursor,
          };
        }

        // Capture the outbox high-water mark in the same transaction that
        // creates the waiting node. Events committed after this query but
        // before the wait becomes visible receive a greater identity and can
        // be recovered from the durable outbox.
        const [latestEvent] =
          wait.kind === "event"
            ? await tx
                .select({ id: max(domainEventOutbox.id) })
                .from(domainEventOutbox)
                .where(eq(domainEventOutbox.workspaceId, lease.workspaceId))
            : [];
        const eventCursor =
          wait.kind === "event" ? Number(latestEvent?.id ?? 0) : null;
        const effectKey = `workflow:${lease.runId}:node:${nodeId}`;
        const [execution] = await tx
          .insert(workflowNodeExecutions)
          .values({
            workspaceId: lease.workspaceId,
            runId: lease.runId,
            nodeId,
            status: "waiting",
            inputSnapshot,
            effectKey,
            waitingKind: wait.kind,
            waitingEventName: wait.eventName ?? null,
            waitingEventCursor: eventCursor,
            waitingResourceId: wait.resourceId ?? null,
            waitingResourceType: wait.resourceType ?? null,
            deadlineAt: wait.deadlineAt,
            startedAt: sql`clock_timestamp()`,
          })
          .returning({ id: workflowNodeExecutions.id });
        if (!execution) throw new Error("WAIT_EXECUTION_INSERT_FAILED");

        const [attempt] = await tx
          .insert(workflowNodeAttempts)
          .values({
            workspaceId: lease.workspaceId,
            executionId: execution.id,
            attemptNo: 1,
            fenceToken: lease.fenceToken,
            status: "waiting",
          })
          .returning({ id: workflowNodeAttempts.id });
        if (!attempt) throw new Error("WAIT_ATTEMPT_INSERT_FAILED");

        const [parkedRun] = await tx
          .update(workflowRuns)
          .set({
            logicalStatus: "waiting",
            nextAttemptAt: wait.deadlineAt,
            lockedBy: null,
            lockedAt: null,
            leaseUntil: null,
            heartbeatAt: null,
            updatedAt: sql`clock_timestamp()`,
          })
          .where(
            and(
              eq(workflowRuns.id, lease.runId),
              eq(workflowRuns.workspaceId, lease.workspaceId),
              eq(workflowRuns.engineVersion, 2),
              eq(workflowRuns.logicalStatus, "running"),
              eq(workflowRuns.lockedBy, lease.workerId),
              eq(workflowRuns.fenceToken, lease.fenceToken),
            ),
          )
          .returning({ id: workflowRuns.id });
        if (!parkedRun) throw new Error("WAIT_RUN_PARK_FAILED");
        return { status: "waiting", eventCursor };
      });
    },
    /** Resume a due delay or convert an expired wait into its explicit port. */
    async resumeDue(lease: RunLease): Promise<boolean> {
      return database.transaction(async (tx) => {
        if (!(await graphRunLeases(tx).renew(lease))) return false;
        const [row] = await tx
          .select({
            execution: workflowNodeExecutions,
            attempt: workflowNodeAttempts,
          })
          .from(workflowNodeExecutions)
          .innerJoin(
            workflowNodeAttempts,
            and(
              eq(workflowNodeAttempts.executionId, workflowNodeExecutions.id),
              eq(workflowNodeAttempts.status, "waiting"),
            ),
          )
          .where(
            and(
              eq(workflowNodeExecutions.workspaceId, lease.workspaceId),
              eq(workflowNodeExecutions.runId, lease.runId),
              eq(workflowNodeExecutions.status, "waiting"),
              or(
                lte(workflowNodeExecutions.deadlineAt, sql`clock_timestamp()`),
                sql`(
                ${workflowNodeExecutions.waitingKind} = 'document_package'
                and coalesce(${workflowNodeExecutions.waitingResourceType}, 'package') = 'package'
                and exists (
                  select 1 from document_request_packages packages
                  where packages.id::text = ${workflowNodeExecutions.waitingResourceId}
                    and packages.workspace_id = ${lease.workspaceId}
                    and packages.status in ('completed', 'declined', 'expired', 'cancelled')
                )
              )
              or (
                ${workflowNodeExecutions.waitingKind} = 'document_package'
                and (
                  ${workflowNodeExecutions.waitingResourceType} = 'document'
                  or ${workflowNodeExecutions.waitingResourceType} is null
                )
                and exists (
                  select 1 from documents signed_documents
                  where signed_documents.id::text = ${workflowNodeExecutions.waitingResourceId}
                    and signed_documents.workspace_id = ${lease.workspaceId}
                    and signed_documents.signature_status in ('signed', 'declined', 'expired')
                )
              )`,
              ),
            ),
          )
          .limit(1);
        if (!row) return false;
        const [packageRow] =
          row.execution.waitingKind === "document_package" &&
          (row.execution.waitingResourceType ?? "package") === "package" &&
          row.execution.waitingResourceId
            ? await tx
                .select({ status: documentRequestPackages.status })
                .from(documentRequestPackages)
                .where(
                  and(
                    sql`${documentRequestPackages.id}::text = ${row.execution.waitingResourceId}`,
                    eq(documentRequestPackages.workspaceId, lease.workspaceId),
                  ),
                )
                .limit(1)
            : [];
        const [signedDocument] =
          row.execution.waitingKind === "document_package" &&
          (row.execution.waitingResourceType ?? "package") === "document" &&
          row.execution.waitingResourceId
            ? await tx
                .select({ signatureStatus: documents.signatureStatus })
                .from(documents)
                .where(
                  and(
                    sql`${documents.id}::text = ${row.execution.waitingResourceId}`,
                    eq(documents.workspaceId, lease.workspaceId),
                  ),
                )
                .limit(1)
            : [];
        const documentState =
          signedDocument &&
          ["signed", "declined", "expired"].includes(
            signedDocument.signatureStatus,
          )
            ? signedDocument.signatureStatus === "signed"
              ? "completed"
              : signedDocument.signatureStatus
            : null;
        const packageState =
          packageRow &&
          ["completed", "declined", "expired", "cancelled"].includes(
            packageRow.status,
          )
            ? packageRow.status
            : null;
        const resolvedDocumentState = documentState ?? packageState;
        const expired =
          !resolvedDocumentState && row.execution.waitingKind !== "delay";
        const port = resolvedDocumentState ?? (expired ? "expired" : "elapsed");
        const [attempt] = await tx
          .update(workflowNodeAttempts)
          .set({
            status: "succeeded",
            finishedAt: sql`clock_timestamp()`,
          })
          .where(
            and(
              eq(workflowNodeAttempts.id, row.attempt.id),
              eq(workflowNodeAttempts.status, "waiting"),
            ),
          )
          .returning({ id: workflowNodeAttempts.id });
        if (!attempt) return false;
        const [execution] = await tx
          .update(workflowNodeExecutions)
          .set({
            status: "succeeded",
            output: resolvedDocumentState
              ? {
                  resourceId: row.execution.waitingResourceId,
                  state: resolvedDocumentState,
                }
              : expired
                ? { expired: true }
                : {},
            resolvedPort: port,
            waitingKind: null,
            waitingEventName: null,
            waitingEventCursor: null,
            waitingResourceId: null,
            waitingResourceType: null,
            finishedAt: sql`clock_timestamp()`,
            updatedAt: sql`clock_timestamp()`,
          })
          .where(
            and(
              eq(workflowNodeExecutions.id, row.execution.id),
              eq(workflowNodeExecutions.status, "waiting"),
            ),
          )
          .returning({ id: workflowNodeExecutions.id });
        if (
          expired &&
          row.execution.waitingKind === "document_package" &&
          (row.execution.waitingResourceType ?? "package") === "package" &&
          row.execution.waitingResourceId
        ) {
          await tx
            .update(documentRequestPackages)
            .set({
              status: "expired",
              resolvedAt: sql`clock_timestamp()`,
              updatedAt: sql`clock_timestamp()`,
            })
            .where(
              and(
                eq(documentRequestPackages.workspaceId, lease.workspaceId),
                sql`${documentRequestPackages.id}::text = ${row.execution.waitingResourceId}`,
                eq(documentRequestPackages.status, "pending"),
              ),
            );
        }
        return Boolean(execution);
      });
    },
    /** Resolve event/approval wait after caller has claimed the waiting run. */
    async resolveWaiting(
      lease: RunLease,
      executionId: string,
      outcome: Extract<NodeOutcome, { status: "succeeded" }>,
    ): Promise<boolean> {
      return database.transaction(async (tx) => {
        if (!(await graphRunLeases(tx).renew(lease))) return false;
        const [row] = await tx
          .select({
            execution: workflowNodeExecutions,
            attempt: workflowNodeAttempts,
            deadlineExpired: sql<boolean>`coalesce(${workflowNodeExecutions.deadlineAt} <= clock_timestamp(), false)`,
          })
          .from(workflowNodeExecutions)
          .innerJoin(
            workflowNodeAttempts,
            and(
              eq(workflowNodeAttempts.executionId, workflowNodeExecutions.id),
              eq(workflowNodeAttempts.status, "waiting"),
            ),
          )
          .where(
            and(
              eq(workflowNodeExecutions.id, executionId),
              eq(workflowNodeExecutions.runId, lease.runId),
              eq(workflowNodeExecutions.workspaceId, lease.workspaceId),
              eq(workflowNodeExecutions.status, "waiting"),
            ),
          )
          .limit(1);
        if (!row) return false;
        // A resolver can race the deadline worker: the run may have been
        // claimed just before the deadline and the external callback may
        // arrive just after it. The deadline is authoritative, so late
        // event/document callbacks must take the explicit expired branch.
        const expired = row.deadlineExpired;
        const output = expired
          ? { expired: true }
          : jsonValueSchema.parse(outcome.output);
        const resolvedPort = expired ? "expired" : (outcome.port ?? null);
        const [attempt] = await tx
          .update(workflowNodeAttempts)
          .set({ status: "succeeded", finishedAt: sql`clock_timestamp()` })
          .where(
            and(
              eq(workflowNodeAttempts.id, row.attempt.id),
              eq(workflowNodeAttempts.status, "waiting"),
            ),
          )
          .returning({ id: workflowNodeAttempts.id });
        if (!attempt) return false;
        const [execution] = await tx
          .update(workflowNodeExecutions)
          .set({
            status: "succeeded",
            output,
            resolvedPort,
            waitingKind: null,
            waitingEventName: null,
            waitingEventCursor: null,
            waitingResourceId: null,
            waitingResourceType: null,
            finishedAt: sql`clock_timestamp()`,
            updatedAt: sql`clock_timestamp()`,
          })
          .where(
            and(
              eq(workflowNodeExecutions.id, executionId),
              eq(workflowNodeExecutions.status, "waiting"),
            ),
          )
          .returning({ id: workflowNodeExecutions.id });
        if (!execution) return false;
        await tx
          .update(workflowRuns)
          .set({
            nextAttemptAt: sql`clock_timestamp()`,
            updatedAt: sql`clock_timestamp()`,
          })
          .where(
            and(
              eq(workflowRuns.id, lease.runId),
              eq(workflowRuns.logicalStatus, "running"),
              eq(workflowRuns.fenceToken, lease.fenceToken),
            ),
          );
        return true;
      });
    },
  };
}
