import "server-only";

import { and, eq } from "drizzle-orm";

import {
  db,
  activityEvents,
  candidateReferrals,
  type CandidateReferral,
} from "@harly/db";

import {
  persistDomainEvent,
  type PersistedDomainEvent,
} from "@/server/events/emit";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ReferralInput = {
  workspaceId: string;
  candidateId: string;
  jobId?: string | null;
  /** Person credited with the referral. */
  referredById: string;
  /** Actor performing the action — used as actorId in events/audit logs. */
  createdById: string;
  note?: string | null;
  featured?: boolean;
};

export function serializeReferral(referral: CandidateReferral) {
  return {
    id: referral.id,
    candidateId: referral.candidateId,
    jobId: referral.jobId,
    referredById: referral.referredById,
    createdById: referral.createdById,
    note: referral.note,
    featured: referral.featured,
    featuredById: referral.featuredById,
    featuredAt: referral.featuredAt?.toISOString() ?? null,
    createdAt: referral.createdAt.toISOString(),
    updatedAt: referral.updatedAt.toISOString(),
  };
}

/**
 * Called from *inside* an already-open db.transaction by both call sites
 * (createCandidate composing candidate+referral, and referCandidate opening
 * its own tx) — never opens its own transaction, so the whole write commits
 * or rolls back together with whatever the caller is doing.
 */
export async function createReferralRecord(
  tx: DatabaseTransaction,
  input: ReferralInput,
): Promise<
  { referral: CandidateReferral; event: PersistedDomainEvent } | { duplicate: true }
> {
  // onConflictDoNothing, not try/catch around a plain insert: a unique
  // violation (23505) aborts the whole surrounding Postgres transaction, so
  // by the time JS could catch the error there'd be no valid transaction left
  // to insert the activity row or commit in. ON CONFLICT DO NOTHING absorbs
  // only the unique/exclusion violation at the DB level and keeps the
  // transaction alive; a NOT NULL or FK violation elsewhere still throws
  // normally (id is a fresh UUID, so the dedupe index is the only realistic
  // conflict target here).
  const [created] = await tx
    .insert(candidateReferrals)
    .values({
      workspaceId: input.workspaceId,
      candidateId: input.candidateId,
      jobId: input.jobId ?? null,
      referredById: input.referredById,
      createdById: input.createdById,
      note: input.note?.trim() || null,
      featured: input.featured ?? false,
      featuredById: input.featured ? input.createdById : null,
      featuredAt: input.featured ? new Date() : null,
    })
    .onConflictDoNothing()
    .returning();
  if (!created) return { duplicate: true };

  await tx.insert(activityEvents).values({
    workspaceId: input.workspaceId,
    actorId: input.createdById,
    entityType: "candidate",
    entityId: input.candidateId,
    type: "referral.added",
    metadata: {
      referralId: created.id,
      jobId: input.jobId ?? null,
      referredById: input.referredById,
      featured: created.featured,
    },
  });

  const event = await persistDomainEvent(tx, {
    name: "candidate.referred",
    workspaceId: input.workspaceId,
    actorId: input.createdById,
    aggregateType: "candidate",
    aggregateId: input.candidateId,
    payload: { referral: serializeReferral(created) },
  });

  return { referral: created, event };
}

/**
 * Mirrors createReferralRecord's transactional shape for the delete path.
 * candidateId is NOT re-derived here from anywhere but the caller-supplied
 * `referral` — the caller (an action) must have already loaded the referral
 * row by id so a client request can never point the activity/event trail at
 * a candidate the referral doesn't actually belong to.
 */
export async function deleteReferralRecord(
  tx: DatabaseTransaction,
  referral: { id: string; workspaceId: string; candidateId: string },
  actorId: string,
): Promise<PersistedDomainEvent | null> {
  // .returning() + null-check: if a concurrent request already deleted this
  // row, this delete affects zero rows — don't emit a second activity entry,
  // domain event, or webhook for a referral that's already gone.
  const [deleted] = await tx
    .delete(candidateReferrals)
    .where(
      and(
        eq(candidateReferrals.id, referral.id),
        eq(candidateReferrals.workspaceId, referral.workspaceId),
      ),
    )
    .returning({ id: candidateReferrals.id });
  if (!deleted) return null;

  await tx.insert(activityEvents).values({
    workspaceId: referral.workspaceId,
    actorId,
    entityType: "candidate",
    entityId: referral.candidateId,
    type: "referral.removed",
    metadata: { referralId: referral.id },
  });

  return persistDomainEvent(tx, {
    name: "candidate.referral_deleted",
    workspaceId: referral.workspaceId,
    actorId,
    aggregateType: "candidate",
    aggregateId: referral.candidateId,
    payload: { referralId: referral.id, candidateId: referral.candidateId },
  });
}
