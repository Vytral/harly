import "server-only";

import {
  and,
  asc,
  eq,
  gt,
  isNull,
  lte,
  lt,
  or,
} from "drizzle-orm";
import { automationAiJobs, db } from "@harly/db";
import { z } from "zod";

import {
  simulateAutomationProposal,
  type AutomationProposalSimulation,
} from "./ai-proposals";
import { jobLifecycleStage, type AutomationLifecycleStage } from "./lifecycle-status";
import type { SimulationScenario } from "./simulation-coverage";
import type { ConditionContext } from "./conditions";
import { assertNotDemo } from "@/features/demo/assert-not-demo";

const MAX_JOB_INPUT_BYTES = 96_000;
const DEFAULT_LEASE_MS = 45_000;
const DEFAULT_TTL_MS = 30 * 60_000;

/**
 * Pure backoff schedule shared by failAutomationAiJob and unit tests:
 * 2^attemptCount seconds capped at 60s. attemptCount is 1-based after claim.
 */
export function computeJobBackoffMs(attemptCount: number): number {
  const attempt = Math.min(Math.max(Math.floor(attemptCount), 1), 8);
  return Math.min(60_000, 2 ** attempt * 1_000);
}

const simulationJobInputSchema = z.object({
  proposalId: z.string().uuid(),
  trigger: z.record(z.string(), z.unknown()),
  scenarios: z.array(z.string()).max(32).optional(),
  conditionContext: z.record(z.string(), z.unknown()).optional(),
});

export type AutomationAiJobKind = "proposal_simulation";
export type AutomationAiJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "expired";

export type AutomationAiJobView = {
  id: string;
  kind: string;
  status: string;
  /** Canonical UI lifecycle stage derived from status (§12.14). */
  lifecycleStage: AutomationLifecycleStage;
  lifecycleReason: string;
  attemptCount: number;
  maxAttempts: number;
  result: unknown;
  error: string | null;
  availableAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  expiresAt: string | null;
  metrics: unknown;
};

function toView(job: typeof automationAiJobs.$inferSelect): AutomationAiJobView {
  const lifecycle = jobLifecycleStage(job.status);
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    lifecycleStage: lifecycle.stage,
    lifecycleReason: lifecycle.reason,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    result: job.result,
    error: job.error,
    availableAt: job.availableAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    expiresAt: job.expiresAt?.toISOString() ?? null,
    metrics: job.metrics,
  };
}

function assertBoundedJson(value: unknown): void {
  const bytes = Buffer.byteLength(JSON.stringify(value), "utf8");
  if (bytes > MAX_JOB_INPUT_BYTES) {
    throw new Error("The durable automation job payload is too large.");
  }
}

export async function enqueueAutomationAiJob(input: {
  workspaceId: string;
  actorId: string;
  kind: AutomationAiJobKind;
  payload: unknown;
  idempotencyKey?: string;
  maxAttempts?: number;
  ttlMs?: number;
}): Promise<AutomationAiJobView> {
  assertNotDemo();
  assertBoundedJson(input.payload);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (input.ttlMs ?? DEFAULT_TTL_MS));

  if (input.idempotencyKey) {
    const [existing] = await db
      .select()
      .from(automationAiJobs)
      .where(
        and(
          eq(automationAiJobs.workspaceId, input.workspaceId),
          eq(automationAiJobs.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) return toView(existing);
  }

  const [job] = await db
    .insert(automationAiJobs)
    .values({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      kind: input.kind,
      status: "queued",
      idempotencyKey: input.idempotencyKey ?? null,
      input: input.payload,
      maxAttempts: Math.min(Math.max(input.maxAttempts ?? 3, 1), 8),
      availableAt: now,
      expiresAt,
    })
    .onConflictDoNothing()
    .returning();

  if (job) return toView(job);
  if (input.idempotencyKey) {
    const [existing] = await db
      .select()
      .from(automationAiJobs)
      .where(
        and(
          eq(automationAiJobs.workspaceId, input.workspaceId),
          eq(automationAiJobs.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) return toView(existing);
  }
  throw new Error("The durable automation job could not be enqueued.");
}

export async function getAutomationAiJob(input: {
  workspaceId: string;
  actorId: string;
  jobId: string;
}): Promise<AutomationAiJobView | null> {
  assertNotDemo();
  const [job] = await db
    .select()
    .from(automationAiJobs)
    .where(
      and(
        eq(automationAiJobs.id, input.jobId),
        eq(automationAiJobs.workspaceId, input.workspaceId),
        eq(automationAiJobs.actorId, input.actorId),
      ),
    )
    .limit(1);
  return job ? toView(job) : null;
}

/**
 * Tool-facing aliases. The service layer uses enqueue/getAutomationAiJob;
 * the model-facing tools are queueAutomationSimulation/getAutomationJob.
 * Re-exported here so docs, tests, and future callers share one name map.
 */
export const queueAutomationSimulation = enqueueAutomationAiJob;
export const getAutomationJob = getAutomationAiJob;

/**
 * Sweeper for the "expired" terminal state. claimAutomationAiJob already
 * ignores expired rows; without this sweeper they would sit in
 * queued/running forever and never surface as expired. Runs inside the
 * normal cron tick (see processAutomationAiJobs) so no dedicated worker
 * is required.
 */
export async function sweepExpiredAutomationAiJobs(input?: {
  limit?: number;
}): Promise<{ expired: number }> {
  assertNotDemo();
  const now = new Date();
  const limit = Math.min(Math.max(input?.limit ?? 100, 1), 500);
  const stale = await db
    .select({ id: automationAiJobs.id })
    .from(automationAiJobs)
    .where(
      and(
        lte(automationAiJobs.expiresAt, now),
        or(
          eq(automationAiJobs.status, "queued"),
          eq(automationAiJobs.status, "running"),
        ),
      ),
    )
    .limit(limit);
  if (stale.length === 0) return { expired: 0 };
  let expired = 0;
  for (const row of stale) {
    const updated = await db
      .update(automationAiJobs)
      .set({
        status: "expired",
        error: "The durable automation job expired before completion.",
        finishedAt: now,
        lockedAt: null,
        lockedBy: null,
        leaseUntil: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(automationAiJobs.id, row.id),
          or(
            eq(automationAiJobs.status, "queued"),
            eq(automationAiJobs.status, "running"),
          ),
        ),
      )
      .returning({ id: automationAiJobs.id });
    expired += updated.length;
  }
  return { expired };
}

async function claimAutomationAiJob(workerId: string) {
  const now = new Date();
  return db.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(automationAiJobs)
      .where(
        and(
          or(
            and(
              eq(automationAiJobs.status, "queued"),
              lte(automationAiJobs.availableAt, now),
            ),
            and(
              eq(automationAiJobs.status, "running"),
              or(
                isNull(automationAiJobs.leaseUntil),
                lt(automationAiJobs.leaseUntil, now),
              ),
            ),
          ),
          or(
            isNull(automationAiJobs.expiresAt),
            gt(automationAiJobs.expiresAt, now),
          ),
        ),
      )
      .orderBy(asc(automationAiJobs.availableAt), asc(automationAiJobs.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!job) return null;

    const leaseUntil = new Date(now.getTime() + DEFAULT_LEASE_MS);
    const [claimed] = await tx
      .update(automationAiJobs)
      .set({
        status: "running",
        attemptCount: job.attemptCount + 1,
        lockedAt: now,
        lockedBy: workerId,
        leaseUntil,
        startedAt: job.startedAt ?? now,
        error: null,
        updatedAt: now,
      })
      .where(eq(automationAiJobs.id, job.id))
      .returning();
    return claimed ?? null;
  });
}

async function finishAutomationAiJob(input: {
  jobId: string;
  workerId: string;
  result: AutomationProposalSimulation;
  durationMs: number;
}): Promise<void> {
  await db
    .update(automationAiJobs)
    .set({
      status: "succeeded",
      result: input.result,
      metrics: { durationMs: input.durationMs, workerId: input.workerId },
      finishedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      leaseUntil: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(automationAiJobs.id, input.jobId),
        eq(automationAiJobs.status, "running"),
        eq(automationAiJobs.lockedBy, input.workerId),
      ),
    );
}

async function failAutomationAiJob(input: {
  job: typeof automationAiJobs.$inferSelect;
  workerId: string;
  error: string;
}): Promise<void> {
  const terminal = input.job.attemptCount >= input.job.maxAttempts;
  const now = new Date();
  await db
    .update(automationAiJobs)
    .set({
      status: terminal ? "failed" : "queued",
      error: input.error.slice(0, 1000),
      availableAt: new Date(
        now.getTime() + (terminal ? 0 : computeJobBackoffMs(input.job.attemptCount)),
      ),
      finishedAt: terminal ? now : null,
      lockedAt: null,
      lockedBy: null,
      leaseUntil: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(automationAiJobs.id, input.job.id),
        eq(automationAiJobs.status, "running"),
        eq(automationAiJobs.lockedBy, input.workerId),
      ),
    );
}

async function executeAutomationAiJob(
  job: typeof automationAiJobs.$inferSelect,
): Promise<AutomationProposalSimulation> {
  if (job.kind !== "proposal_simulation") {
    throw new Error(`Unsupported durable automation job kind: ${job.kind}`);
  }
  const payload = simulationJobInputSchema.parse(job.input);
  return simulateAutomationProposal({
    workspaceId: job.workspaceId,
    actorId: job.actorId,
    proposalId: payload.proposalId,
    trigger: payload.trigger,
    scenarios: payload.scenarios as SimulationScenario[] | undefined,
    conditionContext: payload.conditionContext as
      | Partial<Omit<ConditionContext, "trigger">>
      | undefined,
    permissions: ["automations:manage"],
    // An explicitly queued job is a deliberate re-run request, never a
    // duplicate chat-turn simulation — bypass the reuse short-circuit.
    force: true,
  });
}

/** Process a bounded batch from cron; every job is leased and retryable.
 *
 * Policy (sync vs durable): simulateAutomationProposal stays synchronous
 * for small proposals that fit the 42s route budget; the model must use
 * queueAutomationSimulation + getAutomationJob for large graphs, full
 * branch-coverage matrices, or anything that risks the HTTP timeout. The
 * worker executes the exact same simulateAutomationProposal service, so
 * results are interchangeable.
 */
export async function processAutomationAiJobs(input?: {
  workerId?: string;
  limit?: number;
}): Promise<{ processed: number; succeeded: number; failed: number; expired: number }> {
  assertNotDemo();
  const workerId = input?.workerId ?? `automation-ai-${crypto.randomUUID()}`;
  const limit = Math.min(Math.max(input?.limit ?? 2, 1), 10);
  const { expired } = await sweepExpiredAutomationAiJobs();
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (let index = 0; index < limit; index += 1) {
    const job = await claimAutomationAiJob(workerId);
    if (!job) break;
    processed += 1;
    const started = Date.now();
    try {
      const result = await executeAutomationAiJob(job);
      await finishAutomationAiJob({
        jobId: job.id,
        workerId,
        result,
        durationMs: Date.now() - started,
      });
      succeeded += 1;
    } catch (error) {
      failed += 1;
      await failAutomationAiJob({
        job,
        workerId,
        error: error instanceof Error ? error.message : "AI job failed.",
      });
    }
  }
  return { processed, succeeded, failed, expired };
}
