import "server-only";

import { and, count, desc, eq, inArray, isNull, SQL } from "drizzle-orm";
import { db, type PoolEntry } from "@harly/db";
import {
  candidates,
  poolEntries,
  aiEvaluations,
  candidateTags,
  jobs,
} from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";

export type PoolCandidate = {
  poolEntryId: string;
  candidateId: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  headline: string | null;
  location: string | null;
  skills: string[];
  experienceYears: number | null;
  source: string;
  reason: string | null;
  addedAt: Date;
  tags: string[];
  bestScore: number | null;
  bestRecommendation: string | null;
};

export async function listPoolCandidates(filters?: {
  search?: string;
  tags?: string[];
  source?: string;
  minExperience?: number;
  maxExperience?: number;
  skills?: string[];
}): Promise<PoolCandidate[]> {
  const { organization: workspace } = await getWorkspaceContext();

  const conditions: SQL[] = [
    eq(poolEntries.workspaceId, workspace.id),
    isNull(poolEntries.removedAt),
  ];

  if (filters?.source) {
    conditions.push(eq(poolEntries.source, filters.source as PoolEntry["source"]));
  }

  const rows = await db
    .select({
      poolEntryId: poolEntries.id,
      candidateId: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      email: candidates.email,
      avatarUrl: candidates.avatarUrl,
      headline: candidates.headline,
      location: candidates.location,
      skills: candidates.skills,
      experienceYears: candidates.experienceYears,
      source: poolEntries.source,
      reason: poolEntries.reason,
      addedAt: poolEntries.addedAt,
    })
    .from(poolEntries)
    .innerJoin(candidates, eq(poolEntries.candidateId, candidates.id))
    .where(and(...conditions))
    .orderBy(desc(poolEntries.addedAt));

  const candidateIds = rows.map((r) => r.candidateId);
  if (candidateIds.length === 0) return [];

  // Get tags for all pool candidates
  const tagsRows = await db
    .select({
      candidateId: candidateTags.candidateId,
      label: candidateTags.label,
    })
    .from(candidateTags)
    .where(
      and(
        eq(candidateTags.workspaceId, workspace.id),
        inArray(candidateTags.candidateId, candidateIds),
      ),
    );

  const tagsByCandidate = new Map<string, string[]>();
  for (const tag of tagsRows) {
    const existing = tagsByCandidate.get(tag.candidateId) ?? [];
    existing.push(tag.label);
    tagsByCandidate.set(tag.candidateId, existing);
  }

  // Get best AI evaluation for each candidate
  const evalRows = await db
    .select({
      candidateId: aiEvaluations.candidateId,
      score: aiEvaluations.score,
      recommendation: aiEvaluations.recommendation,
    })
    .from(aiEvaluations)
    .where(inArray(aiEvaluations.candidateId, candidateIds));

  const bestEvalByCandidate = new Map<
    string,
    { score: number; recommendation: string }
  >();
  for (const ev of evalRows) {
    const existing = bestEvalByCandidate.get(ev.candidateId);
    if (!existing || ev.score > existing.score) {
      bestEvalByCandidate.set(ev.candidateId, {
        score: ev.score,
        recommendation: ev.recommendation,
      });
    }
  }

  let poolCandidates: PoolCandidate[] = rows.map((row) => ({
    poolEntryId: row.poolEntryId,
    candidateId: row.candidateId,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    avatarUrl: row.avatarUrl,
    headline: row.headline,
    location: row.location,
    skills: (row.skills as string[]) ?? [],
    experienceYears: row.experienceYears,
    source: row.source,
    reason: row.reason,
    addedAt: row.addedAt,
    tags: tagsByCandidate.get(row.candidateId) ?? [],
    bestScore: bestEvalByCandidate.get(row.candidateId)?.score ?? null,
    bestRecommendation:
      bestEvalByCandidate.get(row.candidateId)?.recommendation ?? null,
  }));

  // Client-side filters for fields not easy to filter in SQL
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    poolCandidates = poolCandidates.filter(
      (c) =>
        c.firstName.toLowerCase().includes(q) ||
        c.lastName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q),
    );
  }

  if (filters?.tags && filters.tags.length > 0) {
    poolCandidates = poolCandidates.filter((c) =>
      filters.tags!.some((t) => c.tags.includes(t)),
    );
  }

  if (filters?.skills && filters.skills.length > 0) {
    poolCandidates = poolCandidates.filter((c) =>
      filters.skills!.some((s) =>
        c.skills.some((cs) => cs.toLowerCase().includes(s.toLowerCase())),
      ),
    );
  }

  if (filters?.minExperience != null) {
    poolCandidates = poolCandidates.filter(
      (c) =>
        c.experienceYears != null && c.experienceYears >= filters.minExperience!,
    );
  }

  if (filters?.maxExperience != null) {
    poolCandidates = poolCandidates.filter(
      (c) =>
        c.experienceYears != null && c.experienceYears <= filters.maxExperience!,
    );
  }

  return poolCandidates;
}

export async function isCandidateInPool(
  candidateId: string,
): Promise<{ inPool: boolean; poolEntryId?: string }> {
  const { organization: workspace } = await getWorkspaceContext();

  const [entry] = await db
    .select({ id: poolEntries.id })
    .from(poolEntries)
    .where(
      and(
        eq(poolEntries.workspaceId, workspace.id),
        eq(poolEntries.candidateId, candidateId),
        isNull(poolEntries.removedAt),
      ),
    )
    .limit(1);

  return entry ? { inPool: true, poolEntryId: entry.id } : { inPool: false };
}

export async function getPoolStats(): Promise<{
  total: number;
  bySource: Record<string, number>;
}> {
  const { organization: workspace } = await getWorkspaceContext();

  const rows = await db
    .select({
      source: poolEntries.source,
      count: count(),
    })
    .from(poolEntries)
    .where(
      and(
        eq(poolEntries.workspaceId, workspace.id),
        isNull(poolEntries.removedAt),
      ),
    )
    .groupBy(poolEntries.source);

  const bySource: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    bySource[row.source] = row.count;
    total += row.count;
  }

  return { total, bySource };
}

export type OpenJob = {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
};

export async function listOpenJobs(): Promise<OpenJob[]> {
  const { organization: workspace } = await getWorkspaceContext();

  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      department: jobs.department,
      location: jobs.location,
    })
    .from(jobs)
    .where(
      and(
        eq(jobs.workspaceId, workspace.id),
        eq(jobs.status, "open"),
        isNull(jobs.deletedAt),
      ),
    )
    .orderBy(desc(jobs.createdAt));

  return rows;
}
