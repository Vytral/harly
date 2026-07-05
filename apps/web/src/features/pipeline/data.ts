import "server-only";

import { and, asc, count, desc, eq, max, notInArray, sql } from "drizzle-orm";

import { db } from "@harly/db";
import {
  aiEvaluations,
  applications,
  applicationStageHistory,
  candidates,
  jobs,
  jobStages,
} from "@harly/db";
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
  aiScore: number | null;
  aiRecommendation: "strong_yes" | "yes" | "maybe" | "no" | null;
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

export function normalizeStageEmailConfig(value: unknown) {
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

export type NextStage = { id: string; name: string; order: number };

/**
 * The stage immediately after `currentStageId` in a job's ordered pipeline.
 * Returns null when the application is already in the final stage (or the job
 * has no stages). Powers the contextual "Move → [next stage]" CTA.
 */
export async function getNextStage(
  jobId: string,
  currentStageId: string | null,
): Promise<NextStage | null> {
  const { organization: workspace } = await getWorkspaceContext();

  const stages = await db
    .select({
      id: jobStages.id,
      name: jobStages.name,
      order: jobStages.order,
    })
    .from(jobStages)
    .where(
      and(
        eq(jobStages.workspaceId, workspace.id),
        eq(jobStages.jobId, jobId),
      ),
    )
    .orderBy(asc(jobStages.order));

  if (stages.length === 0) return null;

  const currentIndex = currentStageId
    ? stages.findIndex((stage) => stage.id === currentStageId)
    : -1;

  return stages[currentIndex + 1] ?? null;
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
        aiScore: aiEvaluations.score,
        aiRecommendation: aiEvaluations.recommendation,
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
      .leftJoin(
        aiEvaluations,
        and(
          eq(aiEvaluations.workspaceId, workspace.id),
          eq(aiEvaluations.applicationId, applications.id),
        ),
      )
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

// ── Pipeline summary ────────────────────────────────────────────────────────

export type PipelineSummary = {
  totalActive: number;
  stalledCandidates: number;
  /** Days threshold used for stalled calculation. */
  stalledDays: number;
  unscored: number;
  byRecommendation: {
    strong_yes: number;
    yes: number;
    maybe: number;
    no: number;
  };
};

/**
 * Return aggregate stats for a job pipeline. Returns null when the job has no
 * active applications, so the card can be hidden without an extra query.
 */
export async function getPipelineSummary(jobId: string): Promise<PipelineSummary | null> {
  const { organization: workspace } = await getWorkspaceContext();

  const STALLED_DAYS = 14;

  const stalledThreshold = new Date(Date.now() - STALLED_DAYS * 24 * 60 * 60 * 1000);

  // Total active applications for this job.
  const [totalsRow] = await db
    .select({ total: count() })
    .from(applications)
    .where(
      and(
        eq(applications.workspaceId, workspace.id),
        eq(applications.jobId, jobId),
        eq(applications.status, "active"),
      ),
    );

  const totalActive = Number(totalsRow?.total ?? 0);
  if (totalActive === 0) return null;

  // Applications that haven't moved stages in STALLED_DAYS days.
  const latestStageMove = db
    .select({
      applicationId: applicationStageHistory.applicationId,
      lastMoved: max(applicationStageHistory.createdAt).as("last_moved"),
    })
    .from(applicationStageHistory)
    .where(eq(applicationStageHistory.workspaceId, workspace.id))
    .groupBy(applicationStageHistory.applicationId)
    .as("latest_stage_move");

  const [stalledRow] = await db
    .select({ stalled: count() })
    .from(applications)
    .leftJoin(latestStageMove, eq(latestStageMove.applicationId, applications.id))
    .where(
      and(
        eq(applications.workspaceId, workspace.id),
        eq(applications.jobId, jobId),
        eq(applications.status, "active"),
        sql`coalesce(${latestStageMove.lastMoved}, ${applications.createdAt}) < ${stalledThreshold.toISOString()}`,
      ),
    );

  // Applications without an AI evaluation.
  const scoredSubquery = db
    .select({ applicationId: aiEvaluations.applicationId })
    .from(aiEvaluations)
    .where(eq(aiEvaluations.workspaceId, workspace.id));

  const [unscoredRow] = await db
    .select({ unscored: count() })
    .from(applications)
    .where(
      and(
        eq(applications.workspaceId, workspace.id),
        eq(applications.jobId, jobId),
        eq(applications.status, "active"),
        notInArray(applications.id, scoredSubquery),
      ),
    );

  // Recommendation breakdown from AI evaluations for this job.
  const recRows = await db
    .select({
      recommendation: aiEvaluations.recommendation,
      cnt: count(),
    })
    .from(aiEvaluations)
    .innerJoin(
      applications,
      and(
        eq(applications.workspaceId, workspace.id),
        eq(applications.id, aiEvaluations.applicationId),
        eq(applications.jobId, jobId),
        eq(applications.status, "active"),
      ),
    )
    .where(eq(aiEvaluations.workspaceId, workspace.id))
    .groupBy(aiEvaluations.recommendation);

  const byRec: PipelineSummary["byRecommendation"] = {
    strong_yes: 0,
    yes: 0,
    maybe: 0,
    no: 0,
  };
  for (const row of recRows) {
    const key = row.recommendation as keyof typeof byRec;
    if (key in byRec) {
      byRec[key] = Number(row.cnt);
    }
  }

  return {
    totalActive,
    stalledCandidates: Number(stalledRow?.stalled ?? 0),
    stalledDays: STALLED_DAYS,
    unscored: Number(unscoredRow?.unscored ?? 0),
    byRecommendation: byRec,
  };
}
