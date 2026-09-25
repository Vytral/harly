import "server-only";

import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { db, interviewSyncs } from "@harly/db";

import { createLogger } from "@/lib/logger";

const log = createLogger("interview-sync-ledger");

export type InterviewSyncProvider =
  | "google_calendar"
  | "zoom"
  | "microsoft_teams"
  | "jitsi";
export type InterviewSyncOperation = "upsert" | "cancel";

type TrackInterviewSyncInput<T> = {
  workspaceId: string;
  interviewId: string;
  provider: InterviewSyncProvider;
  operation: InterviewSyncOperation;
  run: () => Promise<T>;
  isSuccess: (result: T) => boolean;
  resourceId?: (result: T) => string | undefined;
  resourceUrl?: (result: T) => string | undefined;
  /** Throw after recording a failed provider result for a workflow action. */
  strict?: boolean;
  /** Preserve the worker ownership while retrying a claimed ledger row. */
  workerId?: string;
  /** Explicit database boundary for isolated workflow workers. */
  database?: typeof db;
};

export class InterviewProviderSyncError extends Error {
  readonly retryable = true;
  readonly code = "INTERVIEW_PROVIDER_SYNC_FAILED";

  constructor(provider: InterviewSyncProvider) {
    super(`${provider} did not complete the requested interview synchronization.`);
    this.name = "InterviewProviderSyncError";
  }
}

export class InterviewProviderReconciliationError extends Error {
  readonly retryable = true;
  readonly code = "INTERVIEW_PROVIDER_RECONCILIATION_FAILED";

  constructor() {
    super("One or more interview provider effects are still pending.");
    this.name = "InterviewProviderReconciliationError";
  }
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 2000);
}

async function beginInterviewSync(input: {
  workspaceId: string;
  interviewId: string;
  provider: InterviewSyncProvider;
  operation: InterviewSyncOperation;
  workerId?: string;
  database?: typeof db;
}) {
  try {
    const database = input.database ?? db;
    await database
      .insert(interviewSyncs)
      .values({
        workspaceId: input.workspaceId,
        interviewId: input.interviewId,
        provider: input.provider,
        operation: input.operation,
        status: "pending",
        attempts: 1,
        lastAttemptAt: new Date(),
        nextRetryAt: null,
        lastError: null,
        lockedAt: input.workerId ? new Date() : null,
        lockedBy: input.workerId ?? null,
      })
      .onConflictDoUpdate({
        target: [interviewSyncs.interviewId, interviewSyncs.provider],
        set: {
          operation: input.operation,
          status: "pending",
          attempts: sql`${interviewSyncs.attempts} + 1`,
          lastAttemptAt: new Date(),
          nextRetryAt: null,
          lastError: null,
          lockedAt: input.workerId ? new Date() : null,
          lockedBy: input.workerId ?? null,
        },
      });
  } catch (error) {
    // The ledger must never make a valid interview/provider mutation fail.
    log.error(error, "Unable to start interview provider sync ledger entry");
  }
}

async function markInterviewSync(input: {
  workspaceId: string;
  interviewId: string;
  provider: InterviewSyncProvider;
  status: "synced" | "canceled" | "failed";
  error?: string;
  providerResourceId?: string;
  providerUrl?: string;
  workerId?: string;
  database?: typeof db;
}) {
  try {
    const database = input.database ?? db;
    let nextRetryAt: Date | null = null;
    if (input.status === "failed") {
      const [current] = await database
        .select({ attempts: interviewSyncs.attempts })
        .from(interviewSyncs)
        .where(
          and(
            eq(interviewSyncs.workspaceId, input.workspaceId),
            eq(interviewSyncs.interviewId, input.interviewId),
            eq(interviewSyncs.provider, input.provider),
            input.workerId ? eq(interviewSyncs.lockedBy, input.workerId) : undefined,
          ),
        )
        .limit(1);
      const delayMs = Math.min(
        24 * 60 * 60 * 1000,
        30_000 * 2 ** Math.max(0, (current?.attempts ?? 1) - 1),
      );
      nextRetryAt = new Date(Date.now() + delayMs);
    }

    await database
      .update(interviewSyncs)
      .set({
        status: input.status,
        syncedAt: input.status === "failed" ? null : new Date(),
        nextRetryAt,
        lastError: input.error?.slice(0, 2000) ?? null,
        providerResourceId: input.providerResourceId,
        providerUrl: input.providerUrl,
        lockedAt: null,
        lockedBy: null,
      })
      .where(
        and(
          eq(interviewSyncs.workspaceId, input.workspaceId),
          eq(interviewSyncs.interviewId, input.interviewId),
          eq(interviewSyncs.provider, input.provider),
          input.workerId ? eq(interviewSyncs.lockedBy, input.workerId) : undefined,
        ),
      );
  } catch (error) {
    log.error(error, "Unable to finish interview provider sync ledger entry");
  }
}

/**
 * Track one provider mutation without leaking ledger concerns into provider
 * adapters. Failed provider calls are retryable; successful cancellations are
 * terminal for that provider and successful upserts clear stale errors.
 */
export async function trackInterviewSync<T>(
  input: TrackInterviewSyncInput<T>,
): Promise<T> {
  // A claimed retry already transitioned the ledger row to this attempt. Do
  // not run the insert/upsert path again: doing so could steal an expired
  // claim from a newer worker between claim and provider I/O.
  if (!input.workerId) await beginInterviewSync(input);
  try {
    const result = await input.run();
    if (input.isSuccess(result)) {
      await markInterviewSync({
        workspaceId: input.workspaceId,
        interviewId: input.interviewId,
        provider: input.provider,
        status: input.operation === "cancel" ? "canceled" : "synced",
        providerResourceId: input.resourceId?.(result),
        providerUrl: input.resourceUrl?.(result),
        workerId: input.workerId,
        database: input.database,
      });
    } else {
      await markInterviewSync({
        workspaceId: input.workspaceId,
        interviewId: input.interviewId,
        provider: input.provider,
        status: "failed",
        error: "Provider did not complete the requested interview sync.",
        workerId: input.workerId,
        database: input.database,
      });
      if (input.strict) throw new InterviewProviderSyncError(input.provider);
    }
    return result;
  } catch (error) {
    await markInterviewSync({
      workspaceId: input.workspaceId,
      interviewId: input.interviewId,
      provider: input.provider,
      status: "failed",
      error: errorMessage(error),
      workerId: input.workerId,
      database: input.database,
    });
    throw error;
  }
}

/**
 * Claim one explicit retry without allowing a second operator or cron worker
 * to call the provider concurrently. The same worker may renew its claim;
 * another worker can only take it after the lock TTL has elapsed.
 */
export async function claimInterviewSync(input: {
  workspaceId: string;
  syncId: string;
  workerId: string;
  lockTtlMs?: number;
  database?: typeof db;
}): Promise<boolean> {
  const now = new Date();
  const reclaimBefore = new Date(now.getTime() - (input.lockTtlMs ?? 10 * 60 * 1000));
  const database = input.database ?? db;
  const rows = await database
    .update(interviewSyncs)
    .set({
      status: "pending",
      attempts: sql`${interviewSyncs.attempts} + 1`,
      lastAttemptAt: now,
      nextRetryAt: null,
      lastError: null,
      lockedAt: now,
      lockedBy: input.workerId,
    })
    .where(and(
      eq(interviewSyncs.id, input.syncId),
      eq(interviewSyncs.workspaceId, input.workspaceId),
      or(eq(interviewSyncs.status, "pending"), eq(interviewSyncs.status, "failed")),
      or(
        isNull(interviewSyncs.lockedAt),
        lte(interviewSyncs.lockedAt, reclaimBefore),
        eq(interviewSyncs.lockedBy, input.workerId),
      ),
    ))
    .returning({ id: interviewSyncs.id });
  return rows.length === 1;
}

/** Return failed/pending work that is eligible for a future retry worker. */
export async function listDueInterviewSyncs(input: {
  workspaceId: string;
  limit?: number;
}) {
  return db
    .select()
    .from(interviewSyncs)
    .where(
      and(
        eq(interviewSyncs.workspaceId, input.workspaceId),
        or(
          eq(interviewSyncs.status, "pending"),
          and(
            eq(interviewSyncs.status, "failed"),
            or(
              isNull(interviewSyncs.nextRetryAt),
              lte(interviewSyncs.nextRetryAt, new Date()),
            ),
          ),
        ),
      ),
    )
    .limit(input.limit ?? 50);
}

/**
 * Atomically claim due rows for a worker. PostgreSQL row locks plus an expiry
 * make this safe across multiple cron invocations and recoverable after a
 * crashed process. The external provider call happens after this short
 * transaction, never while a database lock is held.
 */
export async function claimDueInterviewSyncs(input: {
  workerId: string;
  limit?: number;
  lockTtlMs?: number;
}) {
  const now = new Date();
  const reclaimBefore = new Date(
    now.getTime() - (input.lockTtlMs ?? 10 * 60 * 1000),
  );

  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(interviewSyncs)
      .where(
        and(
          or(
            eq(interviewSyncs.status, "pending"),
            eq(interviewSyncs.status, "failed"),
          ),
          or(
            isNull(interviewSyncs.nextRetryAt),
            lte(interviewSyncs.nextRetryAt, now),
          ),
          or(
            isNull(interviewSyncs.lockedAt),
            lte(interviewSyncs.lockedAt, reclaimBefore),
          ),
        ),
      )
      .limit(input.limit ?? 50)
      .for("update", { skipLocked: true });

    if (rows.length === 0) return rows;

    await tx
      .update(interviewSyncs)
      .set({ lockedAt: now, lockedBy: input.workerId })
      .where(
        and(
          inArray(
            interviewSyncs.id,
            rows.map((row) => row.id),
          ),
          or(
            isNull(interviewSyncs.lockedAt),
            lte(interviewSyncs.lockedAt, reclaimBefore),
          ),
        ),
      );

    return rows;
  });
}
