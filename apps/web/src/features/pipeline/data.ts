import "server-only";

import { and, asc, desc, eq, max } from "drizzle-orm";

import { db } from "@openhire/db";
import {
  applications,
  applicationStageHistory,
  candidates,
  jobs,
  jobStages,
} from "@openhire/db";
import { getWorkspaceContext } from "@/features/workspaces/context";

export type PipelineJobOption = {
  id: string;
  title: string;
  status: "draft" | "open" | "closed";
};

export type PipelineStage = {
  id: string;
  name: string;
  color: string | null;
  order: number;
  emailConfig: {
    candidateUpdatesEnabled: boolean;
  };
};

export type PipelineApplication = {
  id: string;
  workspaceId: string;
  jobId: string;
  jobTitle: string;
  candidateId: string;
  currentStageId: string;
  pipelineOrder: number;
  candidateFirstName: string;
  candidateLastName: string;
  candidateEmail: string;
  source: string | null;
  status: "active" | "hired" | "rejected" | "withdrawn";
  appliedAt: string;
  createdAt: string;
  lastStageMovedAt: string | null;
};

export type PipelineData =
  | {
      kind: "empty";
      jobs: [];
    }
  | {
      kind: "ready";
      jobs: PipelineJobOption[];
      selectedJob: PipelineJobOption;
      stages: PipelineStage[];
      applications: PipelineApplication[];
    };

async function getDefaultPipelineJobId(workspaceId: string) {
  const [openJobWithApplications] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .innerJoin(
      applications,
      and(
        eq(applications.workspaceId, workspaceId),
        eq(applications.jobId, jobs.id),
      ),
    )
    .where(and(eq(jobs.workspaceId, workspaceId), eq(jobs.status, "open")))
    .orderBy(desc(jobs.createdAt))
    .limit(1);

  if (openJobWithApplications) {
    return openJobWithApplications.id;
  }

  const [latestJob] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.workspaceId, workspaceId))
    .orderBy(desc(jobs.createdAt))
    .limit(1);

  return latestJob?.id ?? null;
}

function normalizeStageEmailConfig(value: unknown) {
  if (
    typeof value === "object" &&
    value !== null &&
    "candidateUpdatesEnabled" in value &&
    typeof value.candidateUpdatesEnabled === "boolean"
  ) {
    return {
      candidateUpdatesEnabled: value.candidateUpdatesEnabled,
    };
  }

  return { candidateUpdatesEnabled: true };
}

export async function getPipelineData(
  requestedJobId: string | undefined,
): Promise<PipelineData> {
  const { organization: workspace } = await getWorkspaceContext();
  const latestStageMove = db
    .select({
      applicationId: applicationStageHistory.applicationId,
      createdAt: max(applicationStageHistory.createdAt).as(
        "last_stage_moved_at",
      ),
    })
    .from(applicationStageHistory)
    .where(eq(applicationStageHistory.workspaceId, workspace.id))
    .groupBy(applicationStageHistory.applicationId)
    .as("latest_stage_move");

  const jobOptions = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      status: jobs.status,
    })
    .from(jobs)
    .where(eq(jobs.workspaceId, workspace.id))
    .orderBy(desc(jobs.createdAt));

  if (jobOptions.length === 0) {
    return { kind: "empty", jobs: [] };
  }

  const requestedJob = requestedJobId
    ? jobOptions.find((job) => job.id === requestedJobId)
    : undefined;
  const defaultJobId =
    requestedJob?.id ?? (await getDefaultPipelineJobId(workspace.id));
  const selectedJob =
    jobOptions.find((job) => job.id === defaultJobId) ?? jobOptions[0];

  const [stages, jobApplications] = await Promise.all([
    db
      .select({
        id: jobStages.id,
        name: jobStages.name,
        color: jobStages.color,
        order: jobStages.order,
        emailConfig: jobStages.emailConfig,
      })
      .from(jobStages)
      .where(
        and(
          eq(jobStages.workspaceId, workspace.id),
          eq(jobStages.jobId, selectedJob.id),
        ),
      )
      .orderBy(asc(jobStages.order)),
    db
      .select({
        id: applications.id,
        workspaceId: applications.workspaceId,
        jobId: applications.jobId,
        jobTitle: jobs.title,
        candidateId: candidates.id,
        currentStageId: applications.currentStageId,
        pipelineOrder: applications.pipelineOrder,
        candidateFirstName: candidates.firstName,
        candidateLastName: candidates.lastName,
        candidateEmail: candidates.email,
        source: applications.source,
        status: applications.status,
        appliedAt: applications.appliedAt,
        createdAt: applications.createdAt,
        lastStageMovedAt: latestStageMove.createdAt,
      })
      .from(applications)
      .innerJoin(
        candidates,
        and(
          eq(candidates.workspaceId, workspace.id),
          eq(candidates.id, applications.candidateId),
        ),
      )
      .innerJoin(
        jobs,
        and(eq(jobs.workspaceId, workspace.id), eq(jobs.id, applications.jobId)),
      )
      .leftJoin(latestStageMove, eq(latestStageMove.applicationId, applications.id))
      .where(
        and(
          eq(applications.workspaceId, workspace.id),
          eq(applications.jobId, selectedJob.id),
        ),
      )
      .orderBy(asc(applications.pipelineOrder), desc(applications.appliedAt)),
  ]);

  return {
    kind: "ready",
    jobs: jobOptions,
    selectedJob,
    applications: jobApplications.map((application) => ({
      ...application,
      appliedAt: application.appliedAt.toISOString(),
      createdAt: application.createdAt.toISOString(),
      lastStageMovedAt: application.lastStageMovedAt
        ? new Date(application.lastStageMovedAt).toISOString()
        : null,
    })),
    stages: stages.map((stage) => ({
      ...stage,
      emailConfig: normalizeStageEmailConfig(stage.emailConfig),
    })),
  };
}
