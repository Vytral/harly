import "server-only";

import { and, desc, eq, isNull, lt, or } from "drizzle-orm";

import { ApiError, type Cursor } from "@harly/api";
import {
  candidates,
  db,
  jobs,
  member,
  poolEntries,
  type Application,
  type PoolEntry,
} from "@harly/db";

import { createApplicationForApi } from "@/features/applications/service";
import {
  ACTIVE_POOL_ENTRY_CONFLICT_MESSAGE,
  isActivePoolEntryUniqueViolation,
} from "@/features/pool/errors";

/** Session-free talent-pool service for the REST API. */

export type PoolEntrySource = "applied" | "imported" | "sourced" | "referred";

export type PoolEntryApiInput = {
  candidateId: string;
  source?: PoolEntrySource;
  jobId?: string | null;
  reason?: string | null;
};

export function serializePoolEntry(entry: PoolEntry) {
  return {
    id: entry.id,
    candidateId: entry.candidateId,
    jobId: entry.jobId,
    source: entry.source,
    reason: entry.reason,
    addedById: entry.addedById,
    addedAt: entry.addedAt.toISOString(),
    removedAt: entry.removedAt?.toISOString() ?? null,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

function cursorWhere(cursor: Cursor | null) {
  if (!cursor) return undefined;
  const createdAt = new Date(cursor.createdAt);
  return or(
    lt(poolEntries.createdAt, createdAt),
    and(eq(poolEntries.createdAt, createdAt), lt(poolEntries.id, cursor.id)),
  );
}

export async function listPoolEntriesForApi(input: {
  workspaceId: string;
  cursor: Cursor | null;
  limit: number;
  candidateId?: string;
  jobId?: string;
  source?: PoolEntrySource;
}): Promise<PoolEntry[]> {
  return db
    .select()
    .from(poolEntries)
    .where(
      and(
        eq(poolEntries.workspaceId, input.workspaceId),
        isNull(poolEntries.removedAt),
        input.candidateId
          ? eq(poolEntries.candidateId, input.candidateId)
          : undefined,
        input.jobId ? eq(poolEntries.jobId, input.jobId) : undefined,
        input.source ? eq(poolEntries.source, input.source) : undefined,
        cursorWhere(input.cursor),
      ),
    )
    .orderBy(desc(poolEntries.createdAt), desc(poolEntries.id))
    .limit(input.limit + 1);
}

async function assertWorkspaceActor(workspaceId: string, actorId: string) {
  const [actor] = await db
    .select({ userId: member.userId })
    .from(member)
    .where(
      and(
        eq(member.organizationId, workspaceId),
        eq(member.userId, actorId),
      ),
    )
    .limit(1);

  if (!actor) {
    throw ApiError.unprocessable("Actor must be a member of this workspace.");
  }
}

async function assertPoolCandidate(workspaceId: string, candidateId: string) {
  const [candidate] = await db
    .select({ id: candidates.id })
    .from(candidates)
    .where(
      and(
        eq(candidates.id, candidateId),
        eq(candidates.workspaceId, workspaceId),
        isNull(candidates.deletedAt),
      ),
    )
    .limit(1);

  if (!candidate) throw ApiError.notFound("Candidate not found.");
}

async function assertPoolJob(workspaceId: string, jobId: string) {
  const [job] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.id, jobId),
        eq(jobs.workspaceId, workspaceId),
        isNull(jobs.deletedAt),
      ),
    )
    .limit(1);

  if (!job) throw ApiError.notFound("Job not found.");
}

async function getActivePoolEntryForApi(input: {
  workspaceId: string;
  poolEntryId: string;
}): Promise<PoolEntry> {
  const [entry] = await db
    .select()
    .from(poolEntries)
    .where(
      and(
        eq(poolEntries.workspaceId, input.workspaceId),
        eq(poolEntries.id, input.poolEntryId),
        isNull(poolEntries.removedAt),
      ),
    )
    .orderBy(desc(poolEntries.addedAt), desc(poolEntries.id))
    .limit(1);

  if (!entry) throw ApiError.notFound("Candidate is not in the talent pool.");
  return entry;
}

export async function addPoolEntryForApi(input: {
  workspaceId: string;
  actorId: string;
  values: PoolEntryApiInput;
}): Promise<PoolEntry> {
  await Promise.all([
    assertWorkspaceActor(input.workspaceId, input.actorId),
    assertPoolCandidate(input.workspaceId, input.values.candidateId),
    input.values.jobId
      ? assertPoolJob(input.workspaceId, input.values.jobId)
      : Promise.resolve(),
  ]);

  const [active] = await db
    .select({ id: poolEntries.id })
    .from(poolEntries)
    .where(
      and(
        eq(poolEntries.workspaceId, input.workspaceId),
        eq(poolEntries.candidateId, input.values.candidateId),
        isNull(poolEntries.removedAt),
      ),
    )
    .limit(1);
  if (active) throw ApiError.conflict(ACTIVE_POOL_ENTRY_CONFLICT_MESSAGE);

  // A removal is reversible: revive most recent historical entry instead of
  // creating unbounded duplicate history for the same candidate.
  const [previous] = await db
    .select()
    .from(poolEntries)
    .where(
      and(
        eq(poolEntries.workspaceId, input.workspaceId),
        eq(poolEntries.candidateId, input.values.candidateId),
      ),
    )
    .orderBy(desc(poolEntries.addedAt), desc(poolEntries.id))
    .limit(1);

  try {
    const now = new Date();
    if (previous?.removedAt) {
      const [restored] = await db
        .update(poolEntries)
        .set({
          jobId: input.values.jobId ?? null,
          reason: input.values.reason ?? null,
          source: input.values.source ?? "sourced",
          addedById: input.actorId,
          addedAt: now,
          removedAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(poolEntries.id, previous.id),
            eq(poolEntries.workspaceId, input.workspaceId),
          ),
        )
        .returning();
      return restored;
    }

    const [entry] = await db
      .insert(poolEntries)
      .values({
        workspaceId: input.workspaceId,
        candidateId: input.values.candidateId,
        jobId: input.values.jobId ?? null,
        reason: input.values.reason ?? null,
        source: input.values.source ?? "sourced",
        addedById: input.actorId,
        addedAt: now,
      })
      .returning();
    return entry;
  } catch (error) {
    if (isActivePoolEntryUniqueViolation(error)) {
      throw ApiError.conflict(ACTIVE_POOL_ENTRY_CONFLICT_MESSAGE);
    }
    throw error;
  }
}

export async function removePoolEntryForApi(input: {
  workspaceId: string;
  actorId: string;
  poolEntryId: string;
}): Promise<void> {
  await assertWorkspaceActor(input.workspaceId, input.actorId);
  const entry = await getActivePoolEntryForApi({
    workspaceId: input.workspaceId,
    poolEntryId: input.poolEntryId,
  });

  await db
    .update(poolEntries)
    .set({ removedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(poolEntries.id, entry.id),
        eq(poolEntries.workspaceId, input.workspaceId),
        isNull(poolEntries.removedAt),
      ),
    );
}

export async function assignPoolEntryToJobForApi(input: {
  workspaceId: string;
  actorId: string;
  poolEntryId: string;
  jobId: string;
}): Promise<Application> {
  const [, entry] = await Promise.all([
    assertWorkspaceActor(input.workspaceId, input.actorId),
    getActivePoolEntryForApi({
      workspaceId: input.workspaceId,
      poolEntryId: input.poolEntryId,
    }),
  ]);

  return createApplicationForApi({
    workspaceId: input.workspaceId,
    candidateId: entry.candidateId,
    jobId: input.jobId,
    source: "sourced",
  });
}
