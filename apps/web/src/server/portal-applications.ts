import "server-only";

import { asc, eq } from "drizzle-orm";
import {
  applications,
  db,
  interviews,
  jobStages,
  organization,
  user,
} from "@harly/db";

/**
 * Select shape for the interviews a candidate sees in their portal application
 * detail. Deliberately excludes `interviews.notes` — those are internal
 * evaluator notes and must never be exposed to the candidate (F1-20).
 */
export const portalInterviewSelect = {
  id: interviews.id,
  title: interviews.title,
  type: interviews.type,
  mode: interviews.mode,
  status: interviews.status,
  scheduledAt: interviews.scheduledAt,
  durationMins: interviews.durationMins,
  location: interviews.location,
  interviewerName: user.name,
  interviewerImage: user.image,
} as const;

export async function getPortalApplicationInterviews(applicationId: string) {
  return db
    .select(portalInterviewSelect)
    .from(interviews)
    .leftJoin(user, eq(user.id, interviews.interviewerId))
    .where(eq(interviews.applicationId, applicationId))
    .orderBy(asc(interviews.scheduledAt));
}

export type PortalInterview = Awaited<
  ReturnType<typeof getPortalApplicationInterviews>
>[number];

export async function getPortalApplicationStage(
  currentStageId: string | null,
) {
  if (!currentStageId) return undefined;
  const [stage] = await db
    .select({ id: jobStages.id, name: jobStages.name, order: jobStages.order })
    .from(jobStages)
    .where(eq(jobStages.id, currentStageId))
    .limit(1);
  return stage;
}

export async function getPortalApplicationRow(applicationId: string) {
  const [row] = await db
    .select({
      id: applications.id,
      status: applications.status,
      currentStageId: applications.currentStageId,
      jobId: applications.jobId,
      workspaceId: applications.workspaceId,
    })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  return row;
}

export async function getPortalJobStages(jobId: string) {
  return db
    .select({ id: jobStages.id, name: jobStages.name, order: jobStages.order })
    .from(jobStages)
    .where(eq(jobStages.jobId, jobId))
    .orderBy(asc(jobStages.order));
}

export async function getPortalOrganizationName(workspaceId: string) {
  const [row] = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, workspaceId))
    .limit(1);
  return row?.name;
}
