import "server-only";

import { createHash } from "node:crypto";

import { and, eq, isNull, sql } from "drizzle-orm";

import {
  candidateEmbeddings,
  candidates,
  db,
  jobEmbeddings,
  jobs,
  poolEntries,
} from "@harly/db";

import type { AiModelConfig } from "@/lib/ai/providers";
import { cosineSimilarity, embedText, EMBEDDING_MODEL_ID } from "@/lib/ai/embeddings";
import { loadResumeText } from "@/lib/resume/load-resume-text";
import { enforceRateLimit } from "@/server/api/ratelimit";

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Number of active Talent Pool candidates available to rank in a workspace. */
export async function countCandidatePool(workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${poolEntries.candidateId})::int` })
    .from(poolEntries)
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, poolEntries.candidateId),
        eq(candidates.workspaceId, workspaceId),
        isNull(candidates.deletedAt),
      ),
    )
    .where(
      and(
        eq(poolEntries.workspaceId, workspaceId),
        isNull(poolEntries.removedAt),
      ),
    );
  return row?.n ?? 0;
}

/** Strip HTML tags from rich-text fields so the embedding input stays compact. */
function plain(html: string | null): string {
  if (!html) return "";
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/** Per-workspace budget so one workspace can't drain its (or a shared) OpenAI
 *  embeddings quota. Re-throws as a plain Error so callers can treat it as a
 *  transient failure rather than an API error. */
async function consumeEmbeddingBudget(workspaceId: string): Promise<void> {
  try {
    await enforceRateLimit(`embed:${workspaceId}`, { limit: 300, windowMs: 60_000 });
  } catch {
    throw new Error("Embedding rate limit exceeded. Try again shortly.");
  }
}

function buildJobEmbeddingText(job: {
  title: string;
  description: string;
  requirements: string | null;
  sector: string | null;
  experienceLevel: string | null;
  keywords: unknown;
}): string {
  const keywords = Array.isArray(job.keywords) ? (job.keywords as string[]) : [];
  return [
    job.title,
    job.sector ? `Sector: ${job.sector}` : null,
    job.experienceLevel ? `Experience level: ${job.experienceLevel}` : null,
    keywords.length > 0 ? `Keywords: ${keywords.join(", ")}` : null,
    plain(job.description),
    job.requirements ? plain(job.requirements) : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildCandidateEmbeddingText(
  candidate: {
    firstName: string;
    lastName: string;
    headline: string | null;
    experienceYears: number | null;
    skills: unknown;
  },
  resumeText: string | null,
): string {
  const skills = Array.isArray(candidate.skills) ? (candidate.skills as string[]) : [];
  return [
    `${candidate.firstName} ${candidate.lastName}`,
    candidate.headline,
    candidate.experienceYears != null ? `${candidate.experienceYears} years experience` : null,
    skills.length > 0 ? `Skills: ${skills.join(", ")}` : null,
    resumeText,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Generate (or refresh, if stale) the embedding for one job. Skips the API call if unchanged. */
export async function ensureJobEmbedding(
  config: AiModelConfig,
  workspaceId: string,
  jobId: string,
): Promise<{ skipped: boolean }> {
  const [job] = await db
    .select({
      title: jobs.title,
      description: jobs.description,
      requirements: jobs.requirements,
      sector: jobs.sector,
      experienceLevel: jobs.experienceLevel,
      keywords: jobs.keywords,
    })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.workspaceId, workspaceId)))
    .limit(1);

  if (!job) throw new Error("Job not found.");

  const text = buildJobEmbeddingText(job);
  const sourceHash = hashText(text);

  const [existing] = await db
    .select({ sourceHash: jobEmbeddings.sourceHash })
    .from(jobEmbeddings)
    .where(and(eq(jobEmbeddings.workspaceId, workspaceId), eq(jobEmbeddings.jobId, jobId)))
    .limit(1);

  if (existing?.sourceHash === sourceHash) {
    return { skipped: true };
  }

  await consumeEmbeddingBudget(workspaceId);
  const embedding = await embedText(config, text);

  await db
    .insert(jobEmbeddings)
    .values({ workspaceId, jobId, model: EMBEDDING_MODEL_ID, embedding, sourceHash })
    .onConflictDoUpdate({
      target: [jobEmbeddings.workspaceId, jobEmbeddings.jobId],
      set: { embedding, sourceHash, model: EMBEDDING_MODEL_ID, updatedAt: new Date() },
    });

  return { skipped: false };
}

/** Generate (or refresh, if stale) the embedding for one candidate. */
export async function ensureCandidateEmbedding(
  config: AiModelConfig,
  workspaceId: string,
  candidateId: string,
): Promise<{ skipped: boolean }> {
  const [candidate] = await db
    .select({
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      headline: candidates.headline,
      experienceYears: candidates.experienceYears,
      skills: candidates.skills,
    })
    .from(candidates)
    .where(and(eq(candidates.id, candidateId), eq(candidates.workspaceId, workspaceId)))
    .limit(1);

  if (!candidate) throw new Error("Candidate not found.");

  const { text: resumeText } = await loadResumeText({ workspaceId, candidateId });
  const text = buildCandidateEmbeddingText(candidate, resumeText);
  const sourceHash = hashText(text);

  const [existing] = await db
    .select({ sourceHash: candidateEmbeddings.sourceHash })
    .from(candidateEmbeddings)
    .where(
      and(
        eq(candidateEmbeddings.workspaceId, workspaceId),
        eq(candidateEmbeddings.candidateId, candidateId),
      ),
    )
    .limit(1);

  if (existing?.sourceHash === sourceHash) {
    return { skipped: true };
  }

  await consumeEmbeddingBudget(workspaceId);
  const embedding = await embedText(config, text);

  await db
    .insert(candidateEmbeddings)
    .values({ workspaceId, candidateId, model: EMBEDDING_MODEL_ID, embedding, sourceHash })
    .onConflictDoUpdate({
      target: [candidateEmbeddings.workspaceId, candidateEmbeddings.candidateId],
      set: { embedding, sourceHash, model: EMBEDDING_MODEL_ID, updatedAt: new Date() },
    });

  return { skipped: false };
}

/** Active Talent Pool candidates never embedded, or edited since their last embedding. */
export async function countCandidatesNeedingIndex(workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${candidates.id})::int` })
    .from(candidates)
    .innerJoin(
      poolEntries,
      and(
        eq(poolEntries.candidateId, candidates.id),
        eq(poolEntries.workspaceId, workspaceId),
        isNull(poolEntries.removedAt),
      ),
    )
    .leftJoin(
      candidateEmbeddings,
      and(
        eq(candidateEmbeddings.workspaceId, workspaceId),
        eq(candidateEmbeddings.candidateId, candidates.id),
      ),
    )
    .where(
      and(
        eq(candidates.workspaceId, workspaceId),
        isNull(candidates.deletedAt),
        sql`(${candidateEmbeddings.id} is null or ${candidates.updatedAt} > ${candidateEmbeddings.updatedAt})`,
      ),
    );
  return row?.n ?? 0;
}

/** Next batch of active Talent Pool candidate IDs that need (re-)indexing, oldest-first. */
async function nextCandidatesToIndex(workspaceId: string, limit: number): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: candidates.id, updatedAt: candidates.updatedAt })
    .from(candidates)
    .innerJoin(
      poolEntries,
      and(
        eq(poolEntries.candidateId, candidates.id),
        eq(poolEntries.workspaceId, workspaceId),
        isNull(poolEntries.removedAt),
      ),
    )
    .leftJoin(
      candidateEmbeddings,
      and(
        eq(candidateEmbeddings.workspaceId, workspaceId),
        eq(candidateEmbeddings.candidateId, candidates.id),
      ),
    )
    .where(
      and(
        eq(candidates.workspaceId, workspaceId),
        isNull(candidates.deletedAt),
        sql`(${candidateEmbeddings.id} is null or ${candidates.updatedAt} > ${candidateEmbeddings.updatedAt})`,
      ),
    )
    .orderBy(candidates.updatedAt)
    .limit(limit);
  return rows.map((r) => r.id);
}

export type IndexBatchResult = { succeeded: number; failed: number; remaining: number };

/** Index up to `limit` stale/never-embedded candidates. Resumable , call again until `remaining` is 0. */
export async function indexCandidateBatch(
  config: AiModelConfig,
  workspaceId: string,
  limit = 20,
): Promise<IndexBatchResult> {
  const ids = await nextCandidatesToIndex(workspaceId, limit);
  let succeeded = 0;
  let failed = 0;

  for (const candidateId of ids) {
    try {
      await ensureCandidateEmbedding(config, workspaceId, candidateId);
      succeeded++;
    } catch (error) {
      console.error("Could not embed candidate", candidateId, error);
      failed++;
    }
  }

  const remaining = await countCandidatesNeedingIndex(workspaceId);
  return { succeeded, failed, remaining };
}

export type JobMatch = {
  candidateId: string;
  fullName: string;
  headline: string | null;
  skills: string[];
  experienceYears: number | null;
  avatarUrl: string | null;
  similarityPct: number;
};

/** Rank active Talent Pool candidates against a job by embedding similarity. */
export async function matchCandidatesForJob(
  config: AiModelConfig,
  workspaceId: string,
  jobId: string,
  limit = 20,
): Promise<JobMatch[]> {
  await ensureJobEmbedding(config, workspaceId, jobId);

  const [jobRow] = await db
    .select({ embedding: jobEmbeddings.embedding })
    .from(jobEmbeddings)
    .where(and(eq(jobEmbeddings.workspaceId, workspaceId), eq(jobEmbeddings.jobId, jobId)))
    .limit(1);

  if (!jobRow) return [];
  const jobVector = jobRow.embedding as number[];

  const rows = await db
    .select({
      candidateId: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      headline: candidates.headline,
      skills: candidates.skills,
      experienceYears: candidates.experienceYears,
      avatarUrl: candidates.avatarUrl,
      embedding: candidateEmbeddings.embedding,
    })
    .from(candidateEmbeddings)
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, candidateEmbeddings.candidateId),
        eq(candidates.workspaceId, workspaceId),
        isNull(candidates.deletedAt),
      ),
    )
    .innerJoin(
      poolEntries,
      and(
        eq(poolEntries.candidateId, candidates.id),
        eq(poolEntries.workspaceId, workspaceId),
        isNull(poolEntries.removedAt),
      ),
    )
    .where(eq(candidateEmbeddings.workspaceId, workspaceId));

  const ranked = Array.from(new Map(rows.map((row) => [row.candidateId, row])).values())
    .map((row) => {
      const similarity = cosineSimilarity(jobVector, row.embedding as number[]);
      return {
        candidateId: row.candidateId,
        fullName: `${row.firstName} ${row.lastName}`,
        headline: row.headline,
        skills: Array.isArray(row.skills) ? (row.skills as string[]) : [],
        experienceYears: row.experienceYears,
        avatarUrl: row.avatarUrl,
        // Cosine ranges [-1, 1]; embeddings of related text cluster near [0, 1], but
        // clamp defensively before mapping to a 0-100 "match" percentage for display.
        similarityPct: Math.round((Math.max(-1, Math.min(1, similarity)) + 1) * 50),
      };
    })
    .sort((a, b) => b.similarityPct - a.similarityPct)
    .slice(0, limit);

  return ranked;
}
