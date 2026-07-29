import "server-only";

import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import {
  applications,
  candidates,
  db,
  interviews,
  jobStages,
  offers,
  organization,
  user,
} from "@harly/db";

/**
 * Select shape for the interviews a candidate sees in their portal application
 * detail. Deliberately excludes `interviews.notes` , those are internal
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
  meetingUrl: interviews.meetLink,
  interviewerName: user.name,
  interviewerImage: user.image,
} as const;

export async function getPortalApplicationInterviews(applicationId: string) {
  return db
    .select(portalInterviewSelect)
    .from(interviews)
    .innerJoin(
      applications,
      and(
        eq(applications.id, interviews.applicationId),
        eq(applications.workspaceId, interviews.workspaceId),
      ),
    )
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, interviews.candidateId),
        eq(candidates.workspaceId, interviews.workspaceId),
        isNull(candidates.deletedAt),
      ),
    )
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
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, applications.candidateId),
        eq(candidates.workspaceId, applications.workspaceId),
        isNull(candidates.deletedAt),
      ),
    )
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

/**
 * The e-signature offer the candidate can sign from the portal, if any. Scoped
 * to the candidate's application in the workspace and limited to e-signature
 * offers (esignSubmissionId set) that are still awaiting or just received a
 * decision. `sent` = actionable (show the "Review & sign" CTA); `accepted`/
 * `declined` = terminal confirmation surfaced after the signing ceremony.
 */
export async function getPortalApplicationOffer(input: {
  applicationId: string;
  candidateId: string;
  workspaceId: string;
}) {
  const [offer] = await db
    .select({
      id: offers.id,
      status: offers.status,
      title: offers.title,
      esignSubmissionId: offers.esignSubmissionId,
      expiresAt: offers.expiresAt,
      decidedAt: offers.decidedAt,
      createdAt: offers.createdAt,
    })
    .from(offers)
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, offers.candidateId),
        eq(candidates.workspaceId, offers.workspaceId),
        isNull(candidates.deletedAt),
      ),
    )
    .where(
      and(
        eq(offers.workspaceId, input.workspaceId),
        eq(offers.applicationId, input.applicationId),
        eq(offers.candidateId, input.candidateId),
        // E-signature offers only: submission id must be present.
        isNotNull(offers.esignSubmissionId),
        // Actionable (sent) or just-decided (the webhook flips these after the
        // signing ceremony). Draft/withdrawn offers are never surfaced here.
        inArray(offers.status, ["sent", "accepted", "declined"]),
      ),
    )
    .orderBy(asc(offers.createdAt))
    .limit(1);
  return offer;
}
