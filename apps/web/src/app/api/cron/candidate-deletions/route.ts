import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { db, dsarRequests } from "@harly/db";
import { and, eq } from "drizzle-orm";
import { permanentlyDeleteCandidate } from "@/features/candidates/data";
import {
  claimDueCandidateDeletionJobs,
  markCandidateDeletionBlocked,
  markCandidateDeletionCompleted,
  markCandidateDeletionFailed,
} from "@/features/candidates/deletion-jobs";
import { authorizeCron } from "@/server/cron-auth";
import { startCronRun } from "@/server/cron-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_KEY = "candidate-deletions";
const BATCH_SIZE = 25;

/** Retries candidate erasures that outlived the original request/process. */
export async function POST(request: NextRequest) {
  const auth = await authorizeCron(request, CRON_KEY);
  if (!auth.ok) return auth.response;
  const run = startCronRun(CRON_KEY);
  const workerId = `${CRON_KEY}:${randomUUID()}`;

  try {
    const claimed = await claimDueCandidateDeletionJobs({
      workerId,
      limit: BATCH_SIZE,
    });
    let succeeded = 0;
    let failed = 0;
    let blocked = 0;

    for (const job of claimed) {
      if (!job.candidateId) {
        await markCandidateDeletionCompleted(job.id, undefined, workerId);
        succeeded += 1;
        continue;
      }

      const result = await permanentlyDeleteCandidate(
        job.candidateId,
        job.requestedBy ?? "system",
      );
      if (result.ok) {
        await markCandidateDeletionCompleted(job.id, result.stats, workerId);
        succeeded += 1;
      } else if (result.error.includes("legal hold")) {
        await markCandidateDeletionBlocked(job.id, result.error, workerId);
        if (job.requestId) {
          await db
            .update(dsarRequests)
            .set({
              status: "blocked",
              blockedReason: result.error,
              blockedBy: job.requestedBy ?? "system",
              blockedAt: new Date(),
              reviewDueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              notes: `Erasure blocked: ${result.error}`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(dsarRequests.id, job.requestId),
                eq(dsarRequests.workspaceId, job.workspaceId),
              ),
            );
        }
        blocked += 1;
      } else {
        await markCandidateDeletionFailed(job.id, result.error, workerId);
        failed += 1;
      }
    }

    const counters = { claimed: claimed.length, succeeded, failed, blocked };
    await run.finish(failed > 0 ? "failed" : "succeeded", counters);
    return NextResponse.json({ ok: true, ...counters });
  } catch (error) {
    await run.finish("failed");
    throw error;
  } finally {
    await auth.release();
  }
}
