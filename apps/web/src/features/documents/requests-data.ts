import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import {
  applications,
  candidates,
  db,
  documentRequests,
  documents,
  jobs,
  user as authUsers,
} from "@harly/db";

import { getWorkspaceContext } from "@/features/workspaces/context";
import { can } from "@/features/workspaces/permissions-server";
import type { DocumentRequestItem } from "./requests-shared";

const requestedByUser = authUsers;

function mapRow(row: {
  id: string;
  applicationId: string;
  candidateId: string;
  title: string;
  instructions: string | null;
  status: string;
  dueAt: Date | null;
  documentId: string | null;
  documentName: string | null;
  requestedByName: string | null;
  submittedAt: Date | null;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
}): DocumentRequestItem {
  return {
    id: row.id,
    applicationId: row.applicationId,
    candidateId: row.candidateId,
    title: row.title,
    instructions: row.instructions,
    status: row.status as DocumentRequestItem["status"],
    dueAt: row.dueAt?.toISOString() ?? null,
    documentId: row.documentId,
    documentName: row.documentName,
    requestedByName: row.requestedByName,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    reviewedByName: row.reviewedByName,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewNote: row.reviewNote,
    createdAt: row.createdAt.toISOString(),
  };
}

const baseColumns = {
  id: documentRequests.id,
  applicationId: documentRequests.applicationId,
  candidateId: documentRequests.candidateId,
  title: documentRequests.title,
  instructions: documentRequests.instructions,
  status: documentRequests.status,
  dueAt: documentRequests.dueAt,
  documentId: documentRequests.documentId,
  documentName: documents.name,
  requestedByName: requestedByUser.name,
  submittedAt: documentRequests.submittedAt,
  reviewedByName: authUsers.name,
  reviewedAt: documentRequests.reviewedAt,
  reviewNote: documentRequests.reviewNote,
  createdAt: documentRequests.createdAt,
};

/** Recruiter-side: every document request for a candidate across applications. */
export async function listDocumentRequestsForCandidate(
  candidateId: string,
): Promise<DocumentRequestItem[]> {
  if (!(await can("documents:read"))) return [];
  const { organization } = await getWorkspaceContext();
  const rows = await db
    .select(baseColumns)
    .from(documentRequests)
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, documentRequests.candidateId),
        eq(candidates.workspaceId, organization.id),
        isNull(candidates.deletedAt),
      ),
    )
    .innerJoin(
      applications,
      and(
        eq(applications.id, documentRequests.applicationId),
        eq(applications.workspaceId, organization.id),
      ),
    )
    .leftJoin(documents, eq(documents.id, documentRequests.documentId))
    .leftJoin(authUsers, eq(authUsers.id, documentRequests.requestedById))
    .where(
      and(
        eq(documentRequests.workspaceId, organization.id),
        eq(documentRequests.candidateId, candidateId),
      ),
    )
    .orderBy(desc(documentRequests.createdAt));
  return rows.map(mapRow);
}

/**
 * Portal-side: requests for one application, scoped to the candidate. No session
 * import here — the caller (portal action) already resolved the portal session,
 * so it passes the trusted workspaceId + candidateId + applicationId.
 */
export async function listDocumentRequestsForPortal(input: {
  workspaceId: string;
  candidateId: string;
  applicationId: string;
}): Promise<DocumentRequestItem[]> {
  const rows = await db
    .select(baseColumns)
    .from(documentRequests)
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, documentRequests.candidateId),
        eq(candidates.workspaceId, input.workspaceId),
        isNull(candidates.deletedAt),
      ),
    )
    .innerJoin(
      applications,
      and(
        eq(applications.id, documentRequests.applicationId),
        eq(applications.workspaceId, input.workspaceId),
      ),
    )
    .leftJoin(documents, eq(documents.id, documentRequests.documentId))
    .leftJoin(authUsers, eq(authUsers.id, documentRequests.requestedById))
    .where(
      and(
        eq(documentRequests.workspaceId, input.workspaceId),
        eq(documentRequests.applicationId, input.applicationId),
        eq(documentRequests.candidateId, input.candidateId),
      ),
    )
    .orderBy(desc(documentRequests.createdAt));
  return rows.map(mapRow);
}

/** Open applications a recruiter can attach a request to, for the request dialog. */
export async function listCandidateApplicationsForRequest(candidateId: string) {
  const { organization } = await getWorkspaceContext();
  return db
    .select({ id: applications.id, jobTitle: jobs.title, status: applications.status })
    .from(applications)
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, applications.candidateId),
        eq(candidates.workspaceId, organization.id),
        isNull(candidates.deletedAt),
      ),
    )
    .innerJoin(
      jobs,
      and(
        eq(jobs.id, applications.jobId),
        eq(jobs.workspaceId, organization.id),
        isNull(jobs.deletedAt),
      ),
    )
    .where(
      and(
        eq(applications.workspaceId, organization.id),
        eq(applications.candidateId, candidateId),
      ),
    )
    .orderBy(desc(applications.createdAt));
}
