import "server-only";

import { and, asc, desc, eq, gte, inArray, isNull, isNotNull, lt, lte, or } from "drizzle-orm";

import {
  applications,
  candidates,
  db,
  documentRequests,
  documents,
  interviewSyncs,
  interviews,
  jobs,
  offers,
  scorecards,
  signatureEnvelopes,
  signatureRecipients,
  user as authUsers,
} from "@harly/db";

import { jobScopeSql } from "@/features/search/scope";
import { resolveSearchActor } from "@/features/search/workspace-search";
import type { InterviewRow, OfferRow } from "./format";

/** Role-scoped queries behind the read tools. Every row is filtered by the caller's job scope. */

const candidateName = (first: string, last: string) => `${first} ${last}`.trim();

export type InterviewListFilters = {
  when: "upcoming" | "past" | "all";
  from?: Date;
  to?: Date;
  candidateId?: string;
  jobId?: string;
  applicationId?: string;
  interviewerId?: string;
  status?: "scheduled" | "completed" | "canceled";
  limit: number;
  offset: number;
};

const interviewColumns = {
  id: interviews.id,
  applicationId: interviews.applicationId,
  candidateId: candidates.id,
  first: candidates.firstName,
  last: candidates.lastName,
  jobId: jobs.id,
  jobTitle: jobs.title,
  interviewerId: interviews.interviewerId,
  interviewerName: authUsers.name,
  title: interviews.title,
  type: interviews.type,
  mode: interviews.mode,
  status: interviews.status,
  scheduledAt: interviews.scheduledAt,
  durationMins: interviews.durationMins,
  location: interviews.location,
  meetLink: interviews.meetLink,
  notes: interviews.notes,
  gcalEventId: interviews.gcalEventId,
  teamsMeetingId: interviews.teamsMeetingId,
  zoomMeetingId: interviews.zoomMeetingId,
  jitsiRoom: interviews.jitsiRoom,
  briefContent: interviews.briefContent,
};

type RawInterview = {
  id: string;
  applicationId: string;
  candidateId: string;
  first: string;
  last: string;
  jobId: string;
  jobTitle: string;
  interviewerId: string | null;
  interviewerName: string | null;
  title: string | null;
  type: string;
  mode: string;
  status: string;
  scheduledAt: Date;
  durationMins: number;
  location: string | null;
  meetLink: string | null;
  notes: string | null;
  gcalEventId: string | null;
  teamsMeetingId: string | null;
  zoomMeetingId: string | null;
  jitsiRoom: string | null;
  briefContent: unknown;
};

function toInterviewRow(row: RawInterview): InterviewRow {
  return { ...row, candidateName: candidateName(row.first, row.last) };
}

export async function queryInterviews(filters: InterviewListFilters): Promise<InterviewRow[]> {
  const actor = await resolveSearchActor();
  const now = new Date();
  const rows = await db
    .select(interviewColumns)
    .from(interviews)
    .innerJoin(
      candidates,
      and(
        eq(candidates.workspaceId, actor.workspaceId),
        eq(candidates.id, interviews.candidateId),
        isNull(candidates.deletedAt),
      ),
    )
    .innerJoin(
      jobs,
      and(eq(jobs.workspaceId, actor.workspaceId), eq(jobs.id, interviews.jobId), isNull(jobs.deletedAt), jobScopeSql(actor)),
    )
    .leftJoin(authUsers, eq(authUsers.id, interviews.interviewerId))
    .where(
      and(
        eq(interviews.workspaceId, actor.workspaceId),
        filters.candidateId ? eq(interviews.candidateId, filters.candidateId) : undefined,
        filters.jobId ? eq(interviews.jobId, filters.jobId) : undefined,
        filters.applicationId ? eq(interviews.applicationId, filters.applicationId) : undefined,
        filters.interviewerId ? eq(interviews.interviewerId, filters.interviewerId) : undefined,
        filters.status ? eq(interviews.status, filters.status) : undefined,
        filters.when === "upcoming" ? gte(interviews.scheduledAt, now) : undefined,
        filters.when === "past" ? lt(interviews.scheduledAt, now) : undefined,
        filters.from ? gte(interviews.scheduledAt, filters.from) : undefined,
        filters.to ? lte(interviews.scheduledAt, filters.to) : undefined,
      ),
    )
    .orderBy(filters.when === "past" ? desc(interviews.scheduledAt) : asc(interviews.scheduledAt))
    .limit(filters.limit + 1)
    .offset(filters.offset);
  return rows.map(toInterviewRow);
}

export async function queryInterviewById(interviewId: string) {
  const actor = await resolveSearchActor();
  const [row] = await db
    .select(interviewColumns)
    .from(interviews)
    .innerJoin(
      candidates,
      and(
        eq(candidates.workspaceId, actor.workspaceId),
        eq(candidates.id, interviews.candidateId),
        isNull(candidates.deletedAt),
      ),
    )
    .innerJoin(
      jobs,
      and(eq(jobs.workspaceId, actor.workspaceId), eq(jobs.id, interviews.jobId), isNull(jobs.deletedAt), jobScopeSql(actor)),
    )
    .leftJoin(authUsers, eq(authUsers.id, interviews.interviewerId))
    .where(and(eq(interviews.workspaceId, actor.workspaceId), eq(interviews.id, interviewId)))
    .limit(1);
  if (!row) return null;
  const syncs = await db
    .select({
      provider: interviewSyncs.provider,
      operation: interviewSyncs.operation,
      status: interviewSyncs.status,
      attempts: interviewSyncs.attempts,
      lastError: interviewSyncs.lastError,
    })
    .from(interviewSyncs)
    .where(and(eq(interviewSyncs.workspaceId, actor.workspaceId), eq(interviewSyncs.interviewId, interviewId)));
  return { interview: toInterviewRow(row), brief: row.briefContent ?? null, syncs };
}

export async function queryOffers(filters: {
  status?: string;
  candidateId?: string;
  jobId?: string;
  applicationId?: string;
  offerId?: string;
  limit: number;
  offset: number;
}): Promise<OfferRow[]> {
  const actor = await resolveSearchActor();
  const rows = await db
    .select({
      id: offers.id,
      applicationId: offers.applicationId,
      candidateId: candidates.id,
      first: candidates.firstName,
      last: candidates.lastName,
      jobId: jobs.id,
      jobTitle: jobs.title,
      status: offers.status,
      title: offers.title,
      salaryAmount: offers.salaryAmount,
      currency: offers.currency,
      salaryPeriod: offers.salaryPeriod,
      equity: offers.equity,
      startDate: offers.startDate,
      expiresAt: offers.expiresAt,
      notes: offers.notes,
      createdByName: authUsers.name,
      decidedAt: offers.decidedAt,
      createdAt: offers.createdAt,
      updatedAt: offers.updatedAt,
    })
    .from(offers)
    .innerJoin(
      candidates,
      and(
        eq(candidates.workspaceId, actor.workspaceId),
        eq(candidates.id, offers.candidateId),
        isNull(candidates.deletedAt),
      ),
    )
    .innerJoin(
      jobs,
      and(eq(jobs.workspaceId, actor.workspaceId), eq(jobs.id, offers.jobId), isNull(jobs.deletedAt), jobScopeSql(actor)),
    )
    .leftJoin(authUsers, eq(authUsers.id, offers.createdById))
    .where(
      and(
        eq(offers.workspaceId, actor.workspaceId),
        filters.offerId ? eq(offers.id, filters.offerId) : undefined,
        filters.status ? eq(offers.status, filters.status as "draft") : undefined,
        filters.candidateId ? eq(offers.candidateId, filters.candidateId) : undefined,
        filters.jobId ? eq(offers.jobId, filters.jobId) : undefined,
        filters.applicationId ? eq(offers.applicationId, filters.applicationId) : undefined,
      ),
    )
    .orderBy(desc(offers.createdAt), desc(offers.id))
    .limit(filters.limit + 1)
    .offset(filters.offset);
  return rows.map(({ first, last, ...rest }) => ({ ...rest, candidateName: candidateName(first, last) }));
}

/** Signature envelope + signer progress for an offer sent through e-signature. */
export async function queryOfferSignature(offerId: string, workspaceId: string) {
  const [offer] = await db
    .select({ envelopeRefId: offers.signatureEnvelopeRefId })
    .from(offers)
    .where(and(eq(offers.workspaceId, workspaceId), eq(offers.id, offerId)))
    .limit(1);
  if (!offer?.envelopeRefId) return null;
  const [envelope] = await db
    .select({
      id: signatureEnvelopes.id,
      provider: signatureEnvelopes.provider,
      status: signatureEnvelopes.status,
      sentAt: signatureEnvelopes.sentAt,
      completedAt: signatureEnvelopes.completedAt,
    })
    .from(signatureEnvelopes)
    .where(and(eq(signatureEnvelopes.workspaceId, workspaceId), eq(signatureEnvelopes.id, offer.envelopeRefId)))
    .limit(1);
  if (!envelope) return null;
  const signers = await db
    .select({
      name: signatureRecipients.name,
      email: signatureRecipients.email,
      status: signatureRecipients.status,
      signedAt: signatureRecipients.signedAt,
    })
    .from(signatureRecipients)
    .where(
      and(
        eq(signatureRecipients.workspaceId, workspaceId),
        eq(signatureRecipients.envelopeId, envelope.id),
        eq(signatureRecipients.role, "signer"),
      ),
    )
    .orderBy(asc(signatureRecipients.routingOrder));
  return {
    provider: envelope.provider,
    status: envelope.status,
    sentAt: envelope.sentAt?.toISOString() ?? null,
    completedAt: envelope.completedAt?.toISOString() ?? null,
    signers: signers.map((s) => ({
      name: s.name,
      email: s.email,
      status: s.status,
      signedAt: s.signedAt?.toISOString() ?? null,
    })),
  };
}

/** Scorecards visible to the caller: those on in-scope applications, plus un-anchored ones. */
export async function queryScorecards(filters: {
  candidateId?: string;
  applicationId?: string;
  limit: number;
  offset: number;
}) {
  const actor = await resolveSearchActor();
  const scope = jobScopeSql(actor);
  const rows = await db
    .select({
      id: scorecards.id,
      candidateId: scorecards.candidateId,
      applicationId: scorecards.applicationId,
      stageId: scorecards.stageId,
      stageName: scorecards.stageName,
      rating: scorecards.rating,
      comment: scorecards.comment,
      authorId: scorecards.authorId,
      authorName: authUsers.name,
      createdAt: scorecards.createdAt,
      updatedAt: scorecards.updatedAt,
      jobId: jobs.id,
    })
    .from(scorecards)
    .innerJoin(
      candidates,
      and(
        eq(candidates.workspaceId, actor.workspaceId),
        eq(candidates.id, scorecards.candidateId),
        isNull(candidates.deletedAt),
      ),
    )
    .leftJoin(applications, eq(applications.id, scorecards.applicationId))
    .leftJoin(jobs, and(eq(jobs.id, applications.jobId), isNull(jobs.deletedAt)))
    .leftJoin(authUsers, eq(authUsers.id, scorecards.authorId))
    .where(
      and(
        eq(scorecards.workspaceId, actor.workspaceId),
        filters.candidateId ? eq(scorecards.candidateId, filters.candidateId) : undefined,
        filters.applicationId ? eq(scorecards.applicationId, filters.applicationId) : undefined,
        scope ? or(isNull(scorecards.applicationId), and(isNotNull(jobs.id), scope)) : undefined,
      ),
    )
    .orderBy(desc(scorecards.createdAt), desc(scorecards.id))
    .limit(filters.limit + 1)
    .offset(filters.offset);
  return rows;
}

/** Latest offer ids for an application (used when an action does not return the new id). */
export async function latestOfferIdsForApplication(applicationId: string, workspaceId: string, statuses: Array<"draft" | "sent">) {
  const rows = await db
    .select({ id: offers.id })
    .from(offers)
    .where(
      and(
        eq(offers.workspaceId, workspaceId),
        eq(offers.applicationId, applicationId),
        inArray(offers.status, statuses),
      ),
    )
    .orderBy(desc(offers.createdAt))
    .limit(1);
  return rows[0]?.id ?? null;
}

/** Document requests on in-scope applications, newest first. */
export async function queryDocumentRequests(filters: {
  status?: string;
  candidateId?: string;
  applicationId?: string;
  requestId?: string;
  limit: number;
  offset: number;
}) {
  const actor = await resolveSearchActor();
  const rows = await db
    .select({
      id: documentRequests.id,
      applicationId: documentRequests.applicationId,
      candidateId: documentRequests.candidateId,
      first: candidates.firstName,
      last: candidates.lastName,
      jobTitle: jobs.title,
      title: documentRequests.title,
      instructions: documentRequests.instructions,
      status: documentRequests.status,
      dueAt: documentRequests.dueAt,
      documentId: documentRequests.documentId,
      documentName: documents.name,
      submittedAt: documentRequests.submittedAt,
      reviewedAt: documentRequests.reviewedAt,
      reviewNote: documentRequests.reviewNote,
      createdAt: documentRequests.createdAt,
    })
    .from(documentRequests)
    .innerJoin(
      candidates,
      and(
        eq(candidates.workspaceId, actor.workspaceId),
        eq(candidates.id, documentRequests.candidateId),
        isNull(candidates.deletedAt),
      ),
    )
    .innerJoin(
      applications,
      and(eq(applications.workspaceId, actor.workspaceId), eq(applications.id, documentRequests.applicationId)),
    )
    .innerJoin(
      jobs,
      and(eq(jobs.workspaceId, actor.workspaceId), eq(jobs.id, applications.jobId), isNull(jobs.deletedAt), jobScopeSql(actor)),
    )
    .leftJoin(documents, eq(documents.id, documentRequests.documentId))
    .where(
      and(
        eq(documentRequests.workspaceId, actor.workspaceId),
        filters.requestId ? eq(documentRequests.id, filters.requestId) : undefined,
        filters.status ? eq(documentRequests.status, filters.status) : undefined,
        filters.candidateId ? eq(documentRequests.candidateId, filters.candidateId) : undefined,
        filters.applicationId ? eq(documentRequests.applicationId, filters.applicationId) : undefined,
      ),
    )
    .orderBy(desc(documentRequests.createdAt), desc(documentRequests.id))
    .limit(filters.limit + 1)
    .offset(filters.offset);
  return rows.map(({ first, last, ...rest }) => ({ ...rest, candidateName: candidateName(first, last) }));
}
