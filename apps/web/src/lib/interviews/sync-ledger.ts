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
};

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 2000);
}

async function beginInterviewSync(input: {
  workspaceId: string;
  interviewId: string;
  provider: InterviewSyncProvider;
  operation: InterviewSyncOperation;
}) {
  try {
    await db
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
        lockedAt: null,
        lockedBy: null,
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
          lockedAt: null,
          lockedBy: null,
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
}) {
  try {
    let nextRetryAt: Date | null = null;
    if (input.status === "failed") {
      const [current] = await db
        .select({ attempts: interviewSyncs.attempts })
        .from(interviewSyncs)
        .where(
          and(
            eq(interviewSyncs.workspaceId, input.workspaceId),
            eq(interviewSyncs.interviewId, input.interviewId),
            eq(interviewSyncs.provider, input.provider),
          ),
        )
        .limit(1);
      const delayMs = Math.min(
        24 * 60 * 60 * 1000,
        30_000 * 2 ** Math.max(0, (current?.attempts ?? 1) - 1),
      );
      nextRetryAt = new Date(Date.now() + delayMs);
    }

    await db
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
  await beginInterviewSync(input);
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
      });
    } else {
      await markInterviewSync({
        workspaceId: input.workspaceId,
        interviewId: input.interviewId,
        provider: input.provider,
        status: "failed",
        error: "Provider did not complete the requested interview sync.",
      });
    }
    return result;
  } catch (error) {
    await markInterviewSync({
      workspaceId: input.workspaceId,
      interviewId: input.interviewId,
      provider: input.provider,
      status: "failed",
      error: errorMessage(error),
    });
    throw error;
  }
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
