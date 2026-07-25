import "server-only";

import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@harly/db";
import {
  applications,
  candidates,
  jobHiringTeam,
  jobStages,
  jobs,
  user as authUsers,
} from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";

/**
 * Home's hero surface (DESIGN.md , Human Data Table).
 *
 * The primary object is the **Application** , a person in a job , not an
 * abstract "candidate". One row is one application, which is why the same human
 * can legitimately appear twice: they are two decisions.
 *
 * Frame 01 maps onto hiring like this:
 *   USERS  → candidate (photo + name)
 *   ROLE   → job title + department chip
 *   STATUS → pipeline stage pill
 *   AMOUNT → how long it has been waiting
 *   TEAM   → the job's hiring team
 */

export type BoardTeamMember = {
  id: string;
  name: string;
  image: string | null;
};

export type BoardApplication = {
  applicationId: string;
  candidateId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  jobId: string;
  jobTitle: string;
  department: string | null;
  stageName: string | null;
  appliedAt: Date;
  /** Whole days since the application landed. Drives the waiting column. */
  daysWaiting: number;
  team: BoardTeamMember[];
};

export type BoardFilterOption = { value: string; label: string };

export type ApplicationsBoard = {
  applications: BoardApplication[];
  jobOptions: BoardFilterOption[];
  stageOptions: BoardFilterOption[];
  /** Total before filtering, so the empty state can tell the two cases apart. */
  totalActive: number;
};

const MAX_ROWS = 50;

function dayjsBetween(from: Date, to: Date) {
  return Math.max(
    0,
    Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)),
  );
}

export async function getApplicationsBoard({
  jobId,
  stage,
}: {
  jobId?: string;
  stage?: string;
} = {}): Promise<ApplicationsBoard> {
  const { organization: workspace } = await getWorkspaceContext();

  // Only active applications. Hired and rejected are archive, not daily work,
  // and putting them here is what turned the old list into a CRM dump.
  const activeOnly = and(
    eq(applications.workspaceId, workspace.id),
    eq(applications.status, "active"),
    isNull(candidates.deletedAt),
  );

  const [rows, jobRows, stageRows] = await Promise.all([
    db
      .select({
        applicationId: applications.id,
        candidateId: candidates.id,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        email: candidates.email,
        avatarUrl: candidates.avatarUrl,
        jobId: jobs.id,
        jobTitle: jobs.title,
        department: jobs.department,
        stageName: jobStages.name,
        appliedAt: applications.appliedAt,
      })
      .from(applications)
      .innerJoin(candidates, eq(candidates.id, applications.candidateId))
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .leftJoin(jobStages, eq(jobStages.id, applications.currentStageId))
      .where(
        jobId
          ? and(activeOnly, eq(applications.jobId, jobId))
          : activeOnly,
      )
      .orderBy(desc(applications.appliedAt))
      .limit(MAX_ROWS),

    // Filter options come from the workspace, not from the filtered rows , a
    // chip that disappears once you use it is a trap.
    db
      .select({ id: jobs.id, title: jobs.title })
      .from(jobs)
      .where(and(eq(jobs.workspaceId, workspace.id), isNull(jobs.deletedAt)))
      .orderBy(asc(jobs.title)),

    db
      .select({ name: jobStages.name, order: jobStages.order })
      .from(jobStages)
      .where(eq(jobStages.workspaceId, workspace.id))
      .orderBy(asc(jobStages.order)),
  ]);

  const teamByJob = await loadHiringTeams(
    workspace.id,
    [...new Set(rows.map((row) => row.jobId))],
  );

  const now = new Date();
  const all: BoardApplication[] = rows.map((row) => ({
    applicationId: row.applicationId,
    candidateId: row.candidateId,
    name: `${row.firstName} ${row.lastName}`.trim(),
    email: row.email,
    avatarUrl: row.avatarUrl,
    jobId: row.jobId,
    jobTitle: row.jobTitle,
    department: row.department ?? null,
    stageName: row.stageName ?? null,
    appliedAt: row.appliedAt,
    daysWaiting: dayjsBetween(row.appliedAt, now),
    team: teamByJob.get(row.jobId) ?? [],
  }));

  // Stage names repeat across jobs (every job has its own "Screening" row), so
  // filtering by name is intentional , the recruiter means the concept.
  const filtered = stage
    ? all.filter((application) => application.stageName === stage)
    : all;

  const uniqueStages = new Map<string, number>();
  for (const row of stageRows) {
    if (!uniqueStages.has(row.name)) uniqueStages.set(row.name, row.order);
  }

  return {
    applications: filtered,
    totalActive: all.length,
    jobOptions: jobRows.map((job) => ({ value: job.id, label: job.title })),
    stageOptions: [...uniqueStages.keys()].map((name) => ({
      value: name,
      label: name,
    })),
  };
}

async function loadHiringTeams(workspaceId: string, jobIds: string[]) {
  const byJob = new Map<string, BoardTeamMember[]>();
  if (jobIds.length === 0) return byJob;

  // One grouped query instead of joining the team onto the application rows,
  // which would multiply every application by its team size.
  const rows = await db
    .select({
      jobId: jobHiringTeam.jobId,
      userId: authUsers.id,
      name: authUsers.name,
      image: authUsers.image,
    })
    .from(jobHiringTeam)
    .innerJoin(authUsers, eq(authUsers.id, jobHiringTeam.userId))
    .where(
      and(
        eq(jobHiringTeam.workspaceId, workspaceId),
        inArray(jobHiringTeam.jobId, jobIds),
      ),
    )
    .orderBy(asc(jobHiringTeam.createdAt));

  for (const row of rows) {
    const list = byJob.get(row.jobId) ?? [];
    list.push({ id: row.userId, name: row.name, image: row.image ?? null });
    byJob.set(row.jobId, list);
  }

  return byJob;
}
