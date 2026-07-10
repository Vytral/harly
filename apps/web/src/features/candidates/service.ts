import "server-only";

import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";

import { ApiError, type Cursor } from "@harly/api";
import { db, candidates, type Candidate } from "@harly/db";
import type {
  CandidateEducationEntry,
  CandidateExperienceEntry,
} from "@harly/db";

import { emitWebhookEvent } from "@/server/webhooks/emit";

/** Workspace-scoped candidate service for the REST API. */

export type CandidateApiInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  location?: string | null;
  headline?: string | null;
  summary?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  websiteUrl?: string | null;
  educationEntries?: CandidateEducationEntry[] | null;
  experienceEntries?: CandidateExperienceEntry[] | null;
};

export function serializeCandidate(candidate: Candidate) {
  return {
    id: candidate.id,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    email: candidate.email,
    phone: candidate.phone,
    address: candidate.address,
    location: candidate.address ?? candidate.location,
    headline: candidate.headline,
    summary: candidate.summary,
    linkedinUrl: candidate.linkedinUrl,
    githubUrl: candidate.githubUrl,
    websiteUrl: candidate.websiteUrl,
    educationEntries: candidate.educationEntries,
    experienceEntries: candidate.experienceEntries,
    createdAt: candidate.createdAt.toISOString(),
    updatedAt: candidate.updatedAt.toISOString(),
  };
}

function cursorWhere(cursor: Cursor | null) {
  if (!cursor) return undefined;
  const createdAt = new Date(cursor.createdAt);
  return or(
    lt(candidates.createdAt, createdAt),
    and(eq(candidates.createdAt, createdAt), lt(candidates.id, cursor.id)),
  );
}

export async function listCandidatesForApi(input: {
  workspaceId: string;
  cursor: Cursor | null;
  limit: number;
}): Promise<Candidate[]> {
  return db
    .select()
    .from(candidates)
    .where(
      and(
        eq(candidates.workspaceId, input.workspaceId),
        isNull(candidates.deletedAt),
        cursorWhere(input.cursor),
      ),
    )
    .orderBy(desc(candidates.createdAt), desc(candidates.id))
    .limit(input.limit + 1);
}

export async function getCandidateForApi(input: {
  workspaceId: string;
  candidateId: string;
}): Promise<Candidate> {
  const [candidate] = await db
    .select()
    .from(candidates)
    .where(
      and(
        eq(candidates.id, input.candidateId),
        eq(candidates.workspaceId, input.workspaceId),
        isNull(candidates.deletedAt),
      ),
    )
    .limit(1);
  if (!candidate) throw ApiError.notFound("Candidate not found.");
  return candidate;
}

export async function createCandidateForApi(input: {
  workspaceId: string;
  values: CandidateApiInput;
}): Promise<Candidate> {
  const email = input.values.email.trim().toLowerCase();

  const [existing] = await db
    .select({ id: candidates.id })
    .from(candidates)
    .where(
      and(
        eq(candidates.workspaceId, input.workspaceId),
        sql`lower(${candidates.email}) = ${email}`,
      ),
    )
    .limit(1);
  if (existing) {
    throw ApiError.conflict("A candidate with this email already exists.");
  }

  const [candidate] = await db
    .insert(candidates)
    .values({
      workspaceId: input.workspaceId,
      firstName: input.values.firstName,
      lastName: input.values.lastName,
      email,
      phone: input.values.phone ?? null,
      address: input.values.address ?? null,
      headline: input.values.headline ?? null,
      summary: input.values.summary ?? null,
      linkedinUrl: input.values.linkedinUrl ?? null,
      githubUrl: input.values.githubUrl ?? null,
      websiteUrl: input.values.websiteUrl ?? null,
      educationEntries: input.values.educationEntries ?? [],
      experienceEntries: input.values.experienceEntries ?? [],
    })
    .returning();

  await emitWebhookEvent(input.workspaceId, "candidate.created", {
    candidate: serializeCandidate(candidate),
  });
  return candidate;
}

export async function updateCandidateForApi(input: {
  workspaceId: string;
  candidateId: string;
  values: Partial<CandidateApiInput>;
}): Promise<Candidate> {
  const existing = await getCandidateForApi({
    workspaceId: input.workspaceId,
    candidateId: input.candidateId,
  });

  const [updated] = await db
    .update(candidates)
    .set({
      firstName: input.values.firstName ?? existing.firstName,
      lastName: input.values.lastName ?? existing.lastName,
      phone: input.values.phone ?? existing.phone,
      address: input.values.address ?? existing.address,
      headline: input.values.headline ?? existing.headline,
      summary: input.values.summary ?? existing.summary,
      linkedinUrl: input.values.linkedinUrl ?? existing.linkedinUrl,
      githubUrl: input.values.githubUrl ?? existing.githubUrl,
      websiteUrl: input.values.websiteUrl ?? existing.websiteUrl,
      educationEntries:
        input.values.educationEntries ?? existing.educationEntries,
      experienceEntries:
        input.values.experienceEntries ?? existing.experienceEntries,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(candidates.id, input.candidateId),
        eq(candidates.workspaceId, input.workspaceId),
      ),
    )
    .returning();

  await emitWebhookEvent(input.workspaceId, "candidate.updated", {
    candidate: serializeCandidate(updated),
  });
  return updated;
}

export async function deleteCandidateForApi(input: {
  workspaceId: string;
  candidateId: string;
}): Promise<void> {
  await getCandidateForApi({
    workspaceId: input.workspaceId,
    candidateId: input.candidateId,
  });
  await db
    .update(candidates)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(candidates.id, input.candidateId),
        eq(candidates.workspaceId, input.workspaceId),
      ),
    );
}
