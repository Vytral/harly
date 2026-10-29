import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db, jobStages } from "@harly/db";

type StageReader = Pick<typeof db, "select">;

/**
 * Resolve a stage a scorecard may be filed against: a stage of the job that is
 * not archived. Archived stages keep history but cannot take new evaluations.
 * Lookup by name is ordered so the result never depends on row order.
 */
export async function findActiveJobStage(
  reader: StageReader,
  input: {
    workspaceId: string;
    jobId: string;
    stageId?: string | null;
    stageName?: string | null;
  },
): Promise<{ id: string; name: string } | null> {
  if (!input.stageId && !input.stageName) return null;
  const [row] = await reader
    .select({ id: jobStages.id, name: jobStages.name })
    .from(jobStages)
    .where(
      and(
        eq(jobStages.workspaceId, input.workspaceId),
        eq(jobStages.jobId, input.jobId),
        input.stageId
          ? eq(jobStages.id, input.stageId)
          : eq(jobStages.name, input.stageName!),
        isNull(jobStages.archivedAt),
      ),
    )
    .orderBy(asc(jobStages.order), asc(jobStages.id))
    .limit(1);
  return row ?? null;
}
