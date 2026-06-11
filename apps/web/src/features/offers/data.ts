import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db, jobs, offers, user as authUsers } from "@harly/db";

import { getWorkspaceContext } from "@/features/workspaces/context";
import type { CandidateOfferItem } from "./shared";

/** All offers across a candidate's applications, newest first. */
export async function listOffersForCandidate(
  candidateId: string,
): Promise<CandidateOfferItem[]> {
  const { organization: workspace } = await getWorkspaceContext();

  const rows = await db
    .select({
      id: offers.id,
      applicationId: offers.applicationId,
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
    })
    .from(offers)
    .innerJoin(
      jobs,
      and(eq(jobs.workspaceId, workspace.id), eq(jobs.id, offers.jobId)),
    )
    .leftJoin(authUsers, eq(authUsers.id, offers.createdById))
    .where(
      and(
        eq(offers.workspaceId, workspace.id),
        eq(offers.candidateId, candidateId),
      ),
    )
    .orderBy(desc(offers.createdAt));

  return rows.map((row) => ({
    ...row,
    startDate: row.startDate?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}
