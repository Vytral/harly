import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";

import {
  db,
  workflowDefinitions,
  workflowExternalActionBuckets,
  workflowExternalActionRefunds,
  workflowRunBuckets,
  workflowRuns,
  workspaceAutomationPolicies,
  workspaceAutomationExternalActionBuckets,
  workspaceAutomationRunBuckets,
} from "@harly/db";
import { recordAutomationGuardDecision } from "@/server/observability/metrics";

/** A bounded chain may still span several workflow definitions. */
export const MAX_LINEAGE_EXTERNAL_ACTIONS = 100;

export type ExternalActionReservationReceipt = {
  reservationId: string;
  bucketStart: Date;
  rootRunId: string;
};

export type ExternalActionReservation =
  | { ok: true; receipt: ExternalActionReservationReceipt }
  | {
      ok: false;
      code:
        | "CIRCUIT_OPEN"
        | "EXTERNAL_RATE_LIMITED"
        | "WORKSPACE_PAUSED"
        | "WORKSPACE_EXTERNAL_RATE_LIMITED"
        | "WORKSPACE_RUN_RATE_LIMITED"
        | "RUN_RATE_LIMITED"
        | "WORKSPACE_CONCURRENCY_LIMITED"
        | "LINEAGE_EFFECT_BUDGET_EXHAUSTED"
        | "WORKFLOW_POLICY_NOT_FOUND";
      deferUntil?: Date;
    };

class ReservationRejected extends Error {
  constructor(readonly code: Extract<ExternalActionReservation, { ok: false }>['code']) {
    super(code);
  }
}

function minuteBucket(now = new Date()): Date {
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours(),
      now.getUTCMinutes(),
    ),
  );
}

export async function workspaceAutomationsEnabled(
  workspaceId: string,
  database: typeof db = db,
): Promise<boolean> {
  const [policy] = await database
    .select({ enabled: workspaceAutomationPolicies.enabled })
    .from(workspaceAutomationPolicies)
    .where(eq(workspaceAutomationPolicies.workspaceId, workspaceId))
    .limit(1);
  return policy?.enabled ?? true;
}

/**
 * Serialize effect start against a workspace pause. The shared row lock is
 * held through the handler call, so a pause update cannot return while an
 * admitted effect has not yet crossed this boundary.
 */
export async function withWorkspaceAutomationEffectPermit<T>(input: {
  workspaceId: string;
  database?: typeof db;
  effect: () => Promise<T>;
}): Promise<{ started: true; value: T } | { started: false }> {
  const database = input.database ?? db;
  return database.transaction(async (tx) => {
    await tx
      .insert(workspaceAutomationPolicies)
      .values({ workspaceId: input.workspaceId })
      .onConflictDoNothing();
    const [policy] = await tx
      .select({ enabled: workspaceAutomationPolicies.enabled })
      .from(workspaceAutomationPolicies)
      .where(eq(workspaceAutomationPolicies.workspaceId, input.workspaceId))
      .for("share");
    if (!policy?.enabled) return { started: false } as const;
    return { started: true, value: await input.effect() } as const;
  });
}

/**
 * Reserve all operational capacity before calling an external provider. The
 * bucket update and root-run budget update are conditional writes, so two
 * workers cannot both be admitted after observing the same old count.
 */
export async function reserveExternalActionPolicy(input: {
  workspaceId: string;
  workflowId: string;
  runId: string;
  database?: typeof db;
  now?: Date;
}): Promise<ExternalActionReservation> {
  const database = input.database ?? db;
  const now = input.now ?? new Date();
  try {
    return await database.transaction(async (tx) => {
    const [run] = await tx
      .select({ rootRunId: workflowRuns.rootRunId })
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.workspaceId, input.workspaceId),
          eq(workflowRuns.id, input.runId),
        ),
      )
      .limit(1);
    if (!run) throw new ReservationRejected("WORKFLOW_POLICY_NOT_FOUND");

    await tx
      .insert(workspaceAutomationPolicies)
      .values({ workspaceId: input.workspaceId })
      .onConflictDoNothing();
    const [workspacePolicy] = await tx
      .select({
        enabled: workspaceAutomationPolicies.enabled,
        maxExternalActionsPerMinute:
          workspaceAutomationPolicies.maxExternalActionsPerMinute,
      })
      .from(workspaceAutomationPolicies)
      .where(eq(workspaceAutomationPolicies.workspaceId, input.workspaceId))
      .for("update");
    if (!workspacePolicy || !workspacePolicy.enabled) {
      throw new ReservationRejected("WORKSPACE_PAUSED");
    }

    const [definition] = await tx
      .select({
        maxExternalActionsPerMinute:
          workflowDefinitions.maxExternalActionsPerMinute,
        circuitOpenUntil: workflowDefinitions.circuitOpenUntil,
      })
      .from(workflowDefinitions)
      .where(
        and(
          eq(workflowDefinitions.workspaceId, input.workspaceId),
          eq(workflowDefinitions.id, input.workflowId),
        ),
      )
      .limit(1);
    if (!definition) throw new ReservationRejected("WORKFLOW_POLICY_NOT_FOUND");
    if (definition.circuitOpenUntil && definition.circuitOpenUntil > now) {
      throw new ReservationRejected("CIRCUIT_OPEN");
    }

    const bucketStart = minuteBucket(now);
    const [workspaceBucket] = await tx
      .insert(workspaceAutomationExternalActionBuckets)
      .values({ workspaceId: input.workspaceId, bucketStart, reserved: 1 })
      .onConflictDoUpdate({
        target: [
          workspaceAutomationExternalActionBuckets.workspaceId,
          workspaceAutomationExternalActionBuckets.bucketStart,
        ],
        set: {
          reserved: sql`${workspaceAutomationExternalActionBuckets.reserved} + 1`,
          updatedAt: sql`clock_timestamp()`,
        },
        where: lt(
          workspaceAutomationExternalActionBuckets.reserved,
          workspacePolicy.maxExternalActionsPerMinute,
        ),
      })
      .returning({ id: workspaceAutomationExternalActionBuckets.id });
    if (!workspaceBucket)
      throw new ReservationRejected("WORKSPACE_EXTERNAL_RATE_LIMITED");

    const [bucket] = await tx
      .insert(workflowExternalActionBuckets)
      .values({
        workspaceId: input.workspaceId,
        workflowId: input.workflowId,
        bucketStart,
        reserved: 1,
      })
      .onConflictDoUpdate({
        target: [
          workflowExternalActionBuckets.workspaceId,
          workflowExternalActionBuckets.workflowId,
          workflowExternalActionBuckets.bucketStart,
        ],
        set: {
          reserved: sql`${workflowExternalActionBuckets.reserved} + 1`,
          updatedAt: sql`clock_timestamp()`,
        },
        where: lt(
          workflowExternalActionBuckets.reserved,
          definition.maxExternalActionsPerMinute,
        ),
      })
      .returning({ id: workflowExternalActionBuckets.id });
    if (!bucket) throw new ReservationRejected("EXTERNAL_RATE_LIMITED");
    const rootRunId = run.rootRunId ?? input.runId;
    const [root] = await tx
      .update(workflowRuns)
      .set({
        lineageExternalActions: sql`${workflowRuns.lineageExternalActions} + 1`,
        updatedAt: sql`clock_timestamp()`,
      })
      .where(
        and(
          eq(workflowRuns.workspaceId, input.workspaceId),
          eq(workflowRuns.id, rootRunId),
          lt(
            workflowRuns.lineageExternalActions,
            MAX_LINEAGE_EXTERNAL_ACTIONS,
          ),
        ),
      )
      .returning({ id: workflowRuns.id });
    if (!root) throw new ReservationRejected("LINEAGE_EFFECT_BUDGET_EXHAUSTED");
    return {
      ok: true,
      receipt: { reservationId: randomUUID(), bucketStart, rootRunId },
    };
    });
  } catch (error) {
    if (error instanceof ReservationRejected) {
      recordAutomationGuardDecision(error.code);
      const deferUntil =
        error.code === "WORKSPACE_PAUSED" ||
        error.code === "WORKSPACE_EXTERNAL_RATE_LIMITED"
          ? new Date(minuteBucket(now).getTime() + 60_000)
          : undefined;
      return { ok: false, code: error.code, deferUntil };
    }
    throw error;
  }
}

/**
 * Return capacity only when the workspace pause gate rejects an action before
 * its provider callback begins. Once a callback starts, the outcome may be
 * externally observable and its reservation must remain consumed.
 */
export async function releaseUnstartedExternalActionReservation(input: {
  workspaceId: string;
  workflowId: string;
  receipt: ExternalActionReservationReceipt;
  database?: typeof db;
}): Promise<void> {
  const database = input.database ?? db;
  await database.transaction(async (tx) => {
    const [refund] = await tx
      .insert(workflowExternalActionRefunds)
      .values({
        reservationId: input.receipt.reservationId,
        workspaceId: input.workspaceId,
        workflowId: input.workflowId,
        rootRunId: input.receipt.rootRunId,
        bucketStart: input.receipt.bucketStart,
      })
      .onConflictDoNothing()
      .returning({ reservationId: workflowExternalActionRefunds.reservationId });
    if (!refund) return;
    await tx
      .update(workspaceAutomationExternalActionBuckets)
      .set({
        reserved: sql`${workspaceAutomationExternalActionBuckets.reserved} - 1`,
        updatedAt: sql`clock_timestamp()`,
      })
      .where(
        and(
          eq(workspaceAutomationExternalActionBuckets.workspaceId, input.workspaceId),
          eq(workspaceAutomationExternalActionBuckets.bucketStart, input.receipt.bucketStart),
          gt(workspaceAutomationExternalActionBuckets.reserved, 0),
        ),
      );
    await tx
      .update(workflowExternalActionBuckets)
      .set({
        reserved: sql`${workflowExternalActionBuckets.reserved} - 1`,
        updatedAt: sql`clock_timestamp()`,
      })
      .where(
        and(
          eq(workflowExternalActionBuckets.workspaceId, input.workspaceId),
          eq(workflowExternalActionBuckets.workflowId, input.workflowId),
          eq(workflowExternalActionBuckets.bucketStart, input.receipt.bucketStart),
          gt(workflowExternalActionBuckets.reserved, 0),
        ),
      );
    await tx
      .update(workflowRuns)
      .set({
        lineageExternalActions: sql`${workflowRuns.lineageExternalActions} - 1`,
        updatedAt: sql`clock_timestamp()`,
      })
      .where(
        and(
          eq(workflowRuns.workspaceId, input.workspaceId),
          eq(workflowRuns.id, input.receipt.rootRunId),
          gt(workflowRuns.lineageExternalActions, 0),
        ),
      );
  });
}

/** Update the live circuit after a provider outcome, not at the end of a run. */
export async function recordExternalActionOutcome(input: {
  workspaceId: string;
  workflowId: string;
  outcome: "succeeded" | "failed" | "uncertain";
  database?: typeof db;
}): Promise<void> {
  const database = input.database ?? db;
  await database.transaction(async (tx) => {
    if (input.outcome === "succeeded") {
      await tx
        .update(workflowDefinitions)
        .set({
          consecutiveFailureCount: 0,
          circuitOpenUntil: null,
          updatedAt: sql`clock_timestamp()`,
        })
        .where(
          and(
            eq(workflowDefinitions.workspaceId, input.workspaceId),
            eq(workflowDefinitions.id, input.workflowId),
          ),
        );
      return;
    }
    const [updated] = await tx
      .update(workflowDefinitions)
      .set({
        consecutiveFailureCount:
          sql`${workflowDefinitions.consecutiveFailureCount} + 1`,
        updatedAt: sql`clock_timestamp()`,
      })
      .where(
        and(
          eq(workflowDefinitions.workspaceId, input.workspaceId),
          eq(workflowDefinitions.id, input.workflowId),
        ),
      )
      .returning({
        failures: workflowDefinitions.consecutiveFailureCount,
        threshold: workflowDefinitions.circuitBreakerThreshold,
        cooldown: workflowDefinitions.circuitBreakerCooldownSeconds,
      });
    const failure = updated?.failures ?? 0;
    if (failure < (updated?.threshold ?? Number.MAX_SAFE_INTEGER)) return;
    await tx
      .update(workflowDefinitions)
      .set({
        circuitOpenUntil:
          sql`clock_timestamp() + (${updated!.cooldown} * interval '1 second')`,
        updatedAt: sql`clock_timestamp()`,
      })
      .where(
        and(
          eq(workflowDefinitions.workspaceId, input.workspaceId),
          eq(workflowDefinitions.id, input.workflowId),
        ),
      );
  });
}

export type RunAdmissionReservation =
  | { ok: true }
  | {
      ok: false;
      code:
        | "CIRCUIT_OPEN"
        | "RUN_RATE_LIMITED"
        | "WORKSPACE_PAUSED"
        | "WORKSPACE_RUN_RATE_LIMITED"
        | "WORKFLOW_POLICY_NOT_FOUND";
      /** Earliest time the caller may retry admission. */
      deferUntil: Date;
    };

/**
 * Atomic per-minute admission for new workflow runs. Unlike the previous
 * soft defer (count then +15s), two workers cannot both admit after seeing
 * the same reserved count — the conditional upsert is the source of truth.
 */
export async function reserveRunAdmissionPolicy(input: {
  workspaceId: string;
  workflowId: string;
  maxRunsPerMinute: number;
  circuitOpenUntil: Date | null;
  database?: typeof db;
  now?: Date;
}): Promise<RunAdmissionReservation> {
  const database = input.database ?? db;
  const now = input.now ?? new Date();
  if (input.circuitOpenUntil && input.circuitOpenUntil > now) {
    recordAutomationGuardDecision("CIRCUIT_OPEN");
    return {
      ok: false,
      code: "CIRCUIT_OPEN",
      deferUntil: input.circuitOpenUntil,
    };
  }
  const bucketStart = minuteBucket(now);
  const nextBucket = new Date(bucketStart.getTime() + 60_000);
  const runAdmissionCodes = [
    "CIRCUIT_OPEN",
    "RUN_RATE_LIMITED",
    "WORKSPACE_PAUSED",
    "WORKSPACE_RUN_RATE_LIMITED",
  ] as const;
  try {
    return await database.transaction(async (tx) => {
      await tx
        .insert(workspaceAutomationPolicies)
        .values({ workspaceId: input.workspaceId })
        .onConflictDoNothing();
      const [policy] = await tx
        .select({
          enabled: workspaceAutomationPolicies.enabled,
          maxRunsPerMinute: workspaceAutomationPolicies.maxRunsPerMinute,
        })
        .from(workspaceAutomationPolicies)
        .where(eq(workspaceAutomationPolicies.workspaceId, input.workspaceId))
        .for("update");
      if (!policy || !policy.enabled) {
        throw new ReservationRejected("WORKSPACE_PAUSED");
      }

      const [workflowBucket] = await tx
        .insert(workflowRunBuckets)
        .values({
          workspaceId: input.workspaceId,
          workflowId: input.workflowId,
          bucketStart,
          reserved: 1,
        })
        .onConflictDoUpdate({
          target: [
            workflowRunBuckets.workspaceId,
            workflowRunBuckets.workflowId,
            workflowRunBuckets.bucketStart,
          ],
          set: {
            reserved: sql`${workflowRunBuckets.reserved} + 1`,
            updatedAt: sql`clock_timestamp()`,
          },
          where: lt(workflowRunBuckets.reserved, input.maxRunsPerMinute),
        })
        .returning({ id: workflowRunBuckets.id });
      if (!workflowBucket) throw new ReservationRejected("RUN_RATE_LIMITED");

      const [workspaceBucket] = await tx
        .insert(workspaceAutomationRunBuckets)
        .values({ workspaceId: input.workspaceId, bucketStart, reserved: 1 })
        .onConflictDoUpdate({
          target: [
            workspaceAutomationRunBuckets.workspaceId,
            workspaceAutomationRunBuckets.bucketStart,
          ],
          set: {
            reserved: sql`${workspaceAutomationRunBuckets.reserved} + 1`,
            updatedAt: sql`clock_timestamp()`,
          },
          where: lt(
            workspaceAutomationRunBuckets.reserved,
            policy.maxRunsPerMinute,
          ),
        })
        .returning({ id: workspaceAutomationRunBuckets.id });
      if (!workspaceBucket)
        throw new ReservationRejected("WORKSPACE_RUN_RATE_LIMITED");
      return { ok: true } as const;
    }).catch((error) => {
      if (!(error instanceof ReservationRejected)) throw error;
      if (!(runAdmissionCodes as readonly string[]).includes(error.code)) {
        throw error;
      }
      recordAutomationGuardDecision(error.code);
      return {
        ok: false as const,
        code: error.code as (typeof runAdmissionCodes)[number],
        deferUntil: nextBucket,
      };
    });
  } catch (error) {
    // Surface infra failures to the caller (fail-closed at dispatch).
    throw error;
  }
}

/** Remove at most `limit` runtime receipts per table, retaining a day for audit/debug. */
export async function cleanupExpiredWorkspaceAutomationBuckets(input: {
  limit?: number;
  now?: Date;
  database?: typeof db;
} = {}): Promise<number> {
  const database = input.database ?? db;
  const limit = Math.min(2_000, Math.max(1, Math.floor(input.limit ?? 500)));
  const cutoff = new Date((input.now ?? new Date()).getTime() - 24 * 60 * 60_000);
  let deleted = 0;
  for (const table of [
    workspaceAutomationRunBuckets,
    workspaceAutomationExternalActionBuckets,
  ]) {
    const expired = database
      .select({ id: table.id })
      .from(table)
      .where(lt(table.bucketStart, cutoff))
      .orderBy(table.bucketStart)
      .limit(limit);
    const rows = await database
      .delete(table)
      .where(inArray(table.id, expired))
      .returning({ id: table.id });
    deleted += rows.length;
  }
  const expiredRefunds = database
    .select({ reservationId: workflowExternalActionRefunds.reservationId })
    .from(workflowExternalActionRefunds)
    .where(lt(workflowExternalActionRefunds.refundedAt, cutoff))
    .orderBy(workflowExternalActionRefunds.refundedAt)
    .limit(limit);
  const refunds = await database
    .delete(workflowExternalActionRefunds)
    .where(
      inArray(
        workflowExternalActionRefunds.reservationId,
        expiredRefunds,
      ),
    )
    .returning({ reservationId: workflowExternalActionRefunds.reservationId });
  return deleted + refunds.length;
}
