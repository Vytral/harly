import "server-only";

import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import { applications, candidates, db, effectiveStageKind, jobStages, jobs } from "@harly/db";
import type { PortalApplicationStatus, PortalStage } from "./application-progress";

export type PortalApplicationSummary = {
  id: string;
  status: PortalApplicationStatus;
  appliedAt: Date;
  updatedAt: Date;
  jobId: string;
  jobTitle: string;
  jobDepartment: string | null;
  jobLocation: string | null;
  currentStageId: string | null;
  stages: PortalStage[];
};

/**
 * Every application the signed-in candidate has in this workspace, newest
 * first, each with its job's open stages. Two queries regardless of how many
 * applications there are. Stages are only loaded when the workspace shows
 * application status to candidates.
 */
export async function listPortalApplications(input: {
  workspaceId: string;
  candidateId: string;
  withStages: boolean;
}): Promise<PortalApplicationSummary[]> {
  const rows = await db
    .select({
      id: applications.id,
      status: applications.status,
      appliedAt: applications.appliedAt,
      updatedAt: applications.updatedAt,
      jobId: applications.jobId,
      jobTitle: jobs.title,
      jobDepartment: jobs.department,
      jobLocation: jobs.location,
      currentStageId: applications.currentStageId,
    })
    .from(applications)
    .innerJoin(
      jobs,
      and(eq(jobs.id, applications.jobId), eq(jobs.workspaceId, input.workspaceId), isNull(jobs.deletedAt)),
    )
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, applications.candidateId),
        eq(candidates.workspaceId, applications.workspaceId),
        isNull(candidates.deletedAt),
      ),
    )
    .where(and(eq(applications.candidateId, input.candidateId), eq(applications.workspaceId, input.workspaceId)))
    .orderBy(desc(applications.appliedAt));

  const stagesByJob = input.withStages
    ? await listPortalJobStages([...new Set(rows.map((row) => row.jobId))])
    : new Map<string, PortalStage[]>();

  return rows.map((row) => ({
    ...row,
    status: row.status as PortalApplicationStatus,
    stages: stagesByJob.get(row.jobId) ?? [],
  }));
}

/**
 * The steps a candidate can see for each job: open stages in order, without
 * the Rejected / Withdrawn outcome stages (endings, not steps to work toward).
 */
export async function listPortalJobStages(jobIds: string[]): Promise<Map<string, PortalStage[]>> {
  const stagesByJob = new Map<string, PortalStage[]>();
  if (jobIds.length === 0) return stagesByJob;
  const stageRows = await db
    .select({
      id: jobStages.id,
      name: jobStages.name,
      order: jobStages.order,
      kind: jobStages.kind,
      jobId: jobStages.jobId,
    })
    .from(jobStages)
    .where(and(inArray(jobStages.jobId, jobIds), isNull(jobStages.archivedAt)))
    .orderBy(asc(jobStages.order));
  for (const { jobId, kind, ...stage } of stageRows) {
    const effective = effectiveStageKind({ kind, name: stage.name });
    if (effective === "rejected" || effective === "withdrawn") continue;
    const list = stagesByJob.get(jobId) ?? [];
    list.push(stage);
    stagesByJob.set(jobId, list);
  }
  return stagesByJob;
}
