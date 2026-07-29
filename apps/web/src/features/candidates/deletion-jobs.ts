import "server-only";

import { randomUUID } from "node:crypto";

import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  lt,
  or,
  sql,
} from "drizzle-orm";

import { candidateDeletionJobs, db } from "@harly/db";

const MAX_ATTEMPTS = 8;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];

export type CandidateDeletionJobInput = {
  workspaceId: string;
  candidateId: string;
  requestedBy: string;
  requestId?: string;
  requestType?: "candidate_delete" | "dsar_erasure" | "reconciliation";
};

export async function enqueueCandidateDeletionJob(
  input: CandidateDeletionJobInput,
) {
  const dedupeKey = input.requestId
    ? `request:${input.requestId}`
    : `candidate:${input.candidateId}`;
  const [deduplicatedJob] = await db
    .select()
    .from(candidateDeletionJobs)
    .where(
      and(
        eq(candidateDeletionJobs.workspaceId, input.workspaceId),
        eq(candidateDeletionJobs.dedupeKey, dedupeKey),
      ),
    )
    .limit(1);
  if (deduplicatedJob) {
    if (["blocked", "dead_letter"].includes(deduplicatedJob.status)) {
      const [requeued] = await db
        .update(candidateDeletionJobs)
        .set({
          status: "pending",
          phase: "queued",
          blockedReason: null,
          lastError: null,
          nextRetryAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          updatedAt: new Date(),
        })
        .where(eq(candidateDeletionJobs.id, deduplicatedJob.id))
        .returning();
      return requeued ?? deduplicatedJob;
    }
    return deduplicatedJob;
  }

  const [activeCandidateJob] = await db
    .select()
    .from(candidateDeletionJobs)
    .where(
      and(
        eq(candidateDeletionJobs.workspaceId, input.workspaceId),
        eq(candidateDeletionJobs.candidateId, input.candidateId),
        or(
          eq(candidateDeletionJobs.status, "pending"),
          eq(candidateDeletionJobs.status, "processing"),
          eq(candidateDeletionJobs.status, "failed"),
          eq(candidateDeletionJobs.status, "blocked"),
          eq(candidateDeletionJobs.status, "dead_letter"),
        ),
      ),
    )
    .orderBy(asc(candidateDeletionJobs.createdAt))
    .limit(1);
  if (activeCandidateJob) {
    if (["blocked", "dead_letter"].includes(activeCandidateJob.status)) {
      const [requeued] = await db
        .update(candidateDeletionJobs)
        .set({
          status: "pending",
          phase: "queued",
          blockedReason: null,
          lastError: null,
          nextRetryAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          updatedAt: new Date(),
        })
        .where(eq(candidateDeletionJobs.id, activeCandidateJob.id))
        .returning();
      return requeued ?? activeCandidateJob;
    }
    return activeCandidateJob;
  }

  const [job] = await db
    .insert(candidateDeletionJobs)
    .values({
      workspaceId: input.workspaceId,
      candidateId: input.candidateId,
      requestId: input.requestId ?? null,
      dedupeKey,
      requestType: input.requestType ?? "candidate_delete",
      requestedBy: input.requestedBy,
      status: "pending",
      phase: "queued",
      nextRetryAt: new Date(),
    })
    .onConflictDoNothing({
      target: [
        candidateDeletionJobs.workspaceId,
        candidateDeletionJobs.dedupeKey,
      ],
    })
    .returning();

  if (job) return job;

  const [existing] = await db
    .select()
    .from(candidateDeletionJobs)
    .where(
      and(
        eq(candidateDeletionJobs.workspaceId, input.workspaceId),
        eq(candidateDeletionJobs.dedupeKey, dedupeKey),
      ),
    )
    .limit(1);
  return existing ?? null;
}

export async function markCandidateDeletionCompleted(
  jobId: string,
  stats?: Record<string, number>,
  workerId?: string,
) {
  const durationMs = stats?.durationMs;
  const [completed] = await db
    .update(candidateDeletionJobs)
    .set({
      status: "completed",
      phase: "completed",
      lockedAt: null,
      lockedBy: null,
      lastError: null,
      completedAt: new Date(),
      stats: stats ?? null,
      durationMs: durationMs ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(candidateDeletionJobs.id, jobId),
        eq(candidateDeletionJobs.status, "processing"),
        workerId ? eq(candidateDeletionJobs.lockedBy, workerId) : undefined,
      ),
    )
    .returning({ id: candidateDeletionJobs.id });
  return Boolean(completed);
}

export async function startCandidateDeletionJob(
  jobId: string,
  workerId: string,
) {
  const [claimed] = await db
    .update(candidateDeletionJobs)
    .set({
      status: "processing",
      phase: "processing",
      attempts: sql`${candidateDeletionJobs.attempts} + 1`,
      lockedAt: new Date(),
      lockedBy: workerId,
      startedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(candidateDeletionJobs.id, jobId),
        or(
          eq(candidateDeletionJobs.status, "pending"),
          eq(candidateDeletionJobs.status, "failed"),
        ),
      ),
    )
    .returning({ id: candidateDeletionJobs.id });
  return claimed ?? null;
}

export async function markCandidateDeletionFailed(
  jobId: string,
  error: unknown,
  workerId?: string,
) {
  const [job] = await db
    .select({ attempts: candidateDeletionJobs.attempts })
    .from(candidateDeletionJobs)
    .where(
      and(
        eq(candidateDeletionJobs.id, jobId),
        eq(candidateDeletionJobs.status, "processing"),
        workerId ? eq(candidateDeletionJobs.lockedBy, workerId) : undefined,
      ),
    )
    .limit(1);
  if (!job) return;

  const attempts = Math.max(1, job.attempts);
  const deadLetter = attempts >= MAX_ATTEMPTS;
  const retryAt = new Date(
    Date.now() +
      RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)]!,
  );
  const message = error instanceof Error ? error.message : String(error);
  const [failed] = await db
    .update(candidateDeletionJobs)
    .set({
      status: deadLetter ? "dead_letter" : "failed",
      phase: "failed",
      nextRetryAt: deadLetter ? null : retryAt,
      lockedAt: null,
      lockedBy: null,
      lastError: message.slice(0, 2000),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(candidateDeletionJobs.id, jobId),
        eq(candidateDeletionJobs.status, "processing"),
        workerId ? eq(candidateDeletionJobs.lockedBy, workerId) : undefined,
      ),
    )
    .returning({ id: candidateDeletionJobs.id });
  return Boolean(failed);
}

export async function markCandidateDeletionBlocked(
  jobId: string,
  reason: string,
  workerId?: string,
) {
  const [blocked] = await db
    .update(candidateDeletionJobs)
    .set({
      status: "blocked",
      phase: "legal_hold",
      blockedReason: reason.slice(0, 1000),
      lockedAt: null,
      lockedBy: null,
      lastError: null,
      nextRetryAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(candidateDeletionJobs.id, jobId),
        eq(candidateDeletionJobs.status, "processing"),
        workerId ? eq(candidateDeletionJobs.lockedBy, workerId) : undefined,
      ),
    )
    .returning({ id: candidateDeletionJobs.id });
  return Boolean(blocked);
}

/** Manually replay a blocked or exhausted job after its root cause is fixed. */
export async function requeueCandidateDeletionJob(input: {
  workspaceId: string;
  jobId: string;
  requestedBy: string;
}) {
  const [requeued] = await db
    .update(candidateDeletionJobs)
    .set({
      status: "pending",
      phase: "queued",
      attempts: 0,
      nextRetryAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: null,
      blockedReason: null,
      startedAt: null,
      completedAt: null,
      stats: null,
      durationMs: null,
      requestedBy: input.requestedBy,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(candidateDeletionJobs.id, input.jobId),
        eq(candidateDeletionJobs.workspaceId, input.workspaceId),
        or(
          eq(candidateDeletionJobs.status, "blocked"),
          eq(candidateDeletionJobs.status, "dead_letter"),
          eq(candidateDeletionJobs.status, "failed"),
        ),
      ),
    )
    .returning();
  return requeued ?? null;
}

export async function claimDueCandidateDeletionJobs(input: {
  workerId?: string;
  limit?: number;
  lockTtlMs?: number;
}) {
  const now = new Date();
  const reclaimBefore = new Date(
    now.getTime() - (input.lockTtlMs ?? 10 * 60_000),
  );
  const workerId = input.workerId ?? `candidate-deletion:${randomUUID()}`;

  return db.transaction(async (tx) => {
    await tx
      .update(candidateDeletionJobs)
      .set({
        status: "dead_letter",
        phase: "failed",
        nextRetryAt: null,
        lockedAt: null,
        lockedBy: null,
        lastError: `Maximum attempts (${MAX_ATTEMPTS}) reached while recovering a stale worker lock.`,
        updatedAt: now,
      })
      .where(
        and(
          eq(candidateDeletionJobs.status, "processing"),
          or(
            isNull(candidateDeletionJobs.lockedAt),
            lte(candidateDeletionJobs.lockedAt, reclaimBefore),
          ),
          gte(candidateDeletionJobs.attempts, MAX_ATTEMPTS),
        ),
      );

    const rows = await tx
      .select()
      .from(candidateDeletionJobs)
      .where(
        or(
          and(
            or(
              eq(candidateDeletionJobs.status, "pending"),
              eq(candidateDeletionJobs.status, "failed"),
            ),
            or(
              isNull(candidateDeletionJobs.nextRetryAt),
              lte(candidateDeletionJobs.nextRetryAt, now),
            ),
            or(
              isNull(candidateDeletionJobs.lockedAt),
              lte(candidateDeletionJobs.lockedAt, reclaimBefore),
            ),
          ),
          and(
            eq(candidateDeletionJobs.status, "processing"),
            lt(candidateDeletionJobs.attempts, MAX_ATTEMPTS),
            or(
              isNull(candidateDeletionJobs.lockedAt),
              lte(candidateDeletionJobs.lockedAt, reclaimBefore),
            ),
          ),
        ),
      )
      .orderBy(asc(candidateDeletionJobs.createdAt))
      .limit(input.limit ?? 25)
      .for("update", { skipLocked: true });

    if (rows.length === 0) return rows;
    await tx
      .update(candidateDeletionJobs)
      .set({
        status: "processing",
        phase: "processing",
        attempts: sql`${candidateDeletionJobs.attempts} + 1`,
        lockedAt: now,
        lockedBy: workerId,
        startedAt: now,
        updatedAt: now,
      })
      .where(
        inArray(
          candidateDeletionJobs.id,
          rows.map((row) => row.id),
        ),
      );
    return rows;
  });
}
