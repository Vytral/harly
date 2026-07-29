import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { db, organization } from "@harly/db";
import { reconcileCandidateDeletion } from "@/features/candidates/reconciliation";
import { authorizeCron } from "@/server/cron-auth";
import { startCronRun } from "@/server/cron-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_KEY = "candidate-reconciliation";

/** Safe-by-default report of historical candidate deletion leftovers. */
export async function POST(request: NextRequest) {
  const auth = await authorizeCron(request, CRON_KEY);
  if (!auth.ok) return auth.response;
  const run = startCronRun(CRON_KEY);
  try {
    const body = (await request.json().catch(() => ({}))) as {
      dryRun?: boolean;
      limit?: number;
    };
    const workspaces = await db
      .select({ id: organization.id })
      .from(organization);
    const reports = await Promise.all(
      workspaces.map((workspace) =>
        reconcileCandidateDeletion({
          workspaceId: workspace.id,
          dryRun: body.dryRun !== false,
          limit: body.limit,
          requestedBy: `reconciliation:${randomUUID()}`,
        }),
      ),
    );
    const counters = {
      workspaces: reports.length,
      deletedCandidates: reports.reduce(
        (total, report) => total + report.deletedCandidates.length,
        0,
      ),
      orphanStorageKeys: reports.reduce(
        (total, report) => total + report.orphanStorageKeys.length,
        0,
      ),
      jobsQueued: reports.reduce(
        (total, report) =>
          total +
          report.deletedCandidates.filter(
            (candidate) => candidate.deletionQueued,
          ).length,
        0,
      ),
    };
    await run.finish("succeeded", counters);
    return NextResponse.json({ ok: true, ...counters, reports });
  } catch (error) {
    await run.finish("failed");
    throw error;
  } finally {
    await auth.release();
  }
}
