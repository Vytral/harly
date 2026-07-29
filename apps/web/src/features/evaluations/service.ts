import "server-only";

import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, lte, max, or, sql } from "drizzle-orm";

import {
  aiEvaluations,
  db,
  evaluationCriteria,
  evaluationCriterionResults,
  evaluationJobs,
  evaluationRubrics,
} from "@harly/db";
import type { CandidateScore } from "@/lib/ai/schemas";
import type { RuleCriterionResult, RulesRubric } from "@/lib/evaluation/rules";

type PersistEvaluationInput = {
  workspaceId: string;
  candidateId: string;
  applicationId: string;
  jobId: string;
  source: "ai" | "rules";
  provider: string;
  modelId: string;
  engine: string;
  engineVersion: string;
  rubricVersion: string;
  rubricId?: string | null;
  rubricSnapshot?: RulesRubric | null;
  result: CandidateScore;
  criterionResults?: RuleCriterionResult[];
  evidenceCoverage?: number | null;
  confidence?: number | null;
  requiresHumanReview?: boolean;
  usedResume: boolean;
  generatedById: string | null;
  inputFingerprintSource: unknown;
};

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(",")}}`;
}

function hash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function toCriterionRows(
  evaluationId: string,
  results: RuleCriterionResult[] | undefined,
  fallback: CandidateScore["criteria"],
): Array<typeof evaluationCriterionResults.$inferInsert> {
  const normalizedResults = results ?? fallback.map((criterion, index) => ({
    key: `criterion:${index + 1}`,
    label: criterion.label,
    status: criterion.evidence ? (criterion.score >= 60 ? "met" : "not_met") : "unknown",
    score: criterion.evidence ? criterion.score : null,
    weight: 0,
    evidence: criterion.evidence,
    evidenceSource: criterion.evidence ? "evaluation" : null,
    confidence: criterion.evidence ? 50 : 0,
    missingReason: criterion.evidence ? null : "No evidence returned by the evaluation engine.",
  } satisfies RuleCriterionResult));
  return normalizedResults.map((criterion) => ({
    evaluationId,
    criterionKey: criterion.key,
    label: criterion.label,
    status: criterion.status,
    score: criterion.score,
    weight: criterion.weight,
    evidence: criterion.evidence,
    evidenceSource: criterion.evidenceSource,
    confidence: criterion.confidence,
    missingReason: criterion.missingReason,
  }));
}

async function ensureRubric(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: PersistEvaluationInput,
): Promise<string | null> {
  if (!input.rubricSnapshot) return null;
  const configHash = hash(input.rubricSnapshot);
  const [existing] = await tx
    .select({ id: evaluationRubrics.id })
    .from(evaluationRubrics)
    .where(
      and(
        eq(evaluationRubrics.workspaceId, input.workspaceId),
        eq(evaluationRubrics.jobId, input.jobId),
        eq(evaluationRubrics.configHash, configHash),
      ),
    )
    .limit(1);
  if (existing) return existing.id;

  const [latest] = await tx
    .select({ version: max(evaluationRubrics.version) })
    .from(evaluationRubrics)
    .where(
      and(
        eq(evaluationRubrics.workspaceId, input.workspaceId),
        eq(evaluationRubrics.jobId, input.jobId),
      ),
    );
  const [rubric] = await tx
    .insert(evaluationRubrics)
    .values({
      workspaceId: input.workspaceId,
      jobId: input.jobId,
      version: Number(latest?.version ?? 0) + 1,
      status: "system_default",
      configHash,
      createdById: input.generatedById,
      publishedAt: null,
    })
    .onConflictDoNothing()
    .returning({ id: evaluationRubrics.id });
  if (!rubric) {
    const [raced] = await tx
      .select({ id: evaluationRubrics.id })
      .from(evaluationRubrics)
      .where(
        and(
          eq(evaluationRubrics.workspaceId, input.workspaceId),
          eq(evaluationRubrics.jobId, input.jobId),
          eq(evaluationRubrics.configHash, configHash),
        ),
      )
      .limit(1);
    return raced?.id ?? null;
  }

  await tx.insert(evaluationCriteria).values(
    input.rubricSnapshot.criteria.map((criterion) => ({
      rubricId: rubric.id,
      key: criterion.key,
      label: criterion.label,
      type: criterion.type,
      importance: criterion.importance,
      weight: criterion.weight,
      aliases: criterion.aliases,
      minimumValue: criterion.minimumValue ?? null,
    })),
  );
  return rubric.id;
}

/** Persist the complete, reproducible evaluation atomically with its evidence. */
export async function persistCandidateEvaluation(input: PersistEvaluationInput) {
  const inputHash = hash(input.inputFingerprintSource);
  const outputHash = hash(input.result);
  const values = {
    workspaceId: input.workspaceId,
    candidateId: input.candidateId,
    applicationId: input.applicationId,
    jobId: input.jobId,
    rubricId: input.rubricId ?? null,
    source: input.source,
    engine: input.engine,
    engineVersion: input.engineVersion,
    rubricVersion: input.rubricVersion,
    inputHash,
    outputHash,
    evidenceCoverage: input.evidenceCoverage ?? null,
    confidence: input.confidence ?? null,
    requiresHumanReview: input.requiresHumanReview ?? true,
    evaluationStatus: "completed",
    rubricSnapshot: input.rubricSnapshot ?? null,
    provider: input.provider,
    modelId: input.modelId,
    score: input.result.score,
    recommendation: input.result.recommendation,
    summary: input.result.summary,
    strengths: input.result.strengths,
    gaps: input.result.gaps,
    criteria: input.result.criteria,
    usedResume: input.usedResume,
    generatedById: input.generatedById,
  } satisfies typeof aiEvaluations.$inferInsert;

  return db.transaction(async (tx) => {
    const rubricId = input.rubricId ?? await ensureRubric(tx, input);
    values.rubricId = rubricId;
    const [evaluation] = await tx
      .insert(aiEvaluations)
      .values(values)
      .onConflictDoUpdate({
        target: [aiEvaluations.workspaceId, aiEvaluations.applicationId],
        set: { ...values, updatedAt: new Date() },
      })
      .returning({ id: aiEvaluations.id });

    if (!evaluation) throw new Error("Could not persist candidate evaluation.");

    await tx
      .delete(evaluationCriterionResults)
      .where(eq(evaluationCriterionResults.evaluationId, evaluation.id));

    const criterionRows = toCriterionRows(evaluation.id, input.criterionResults, input.result.criteria);
    if (criterionRows.length > 0) {
      await tx.insert(evaluationCriterionResults).values(criterionRows);
    }

    return { id: evaluation.id, inputHash, outputHash };
  });
}

export function hashEvaluationInput(value: unknown): string {
  return hash(value);
}

export async function getPublishedRulesRubric(workspaceId: string, jobId: string): Promise<RulesRubric | null> {
  const [rubric] = await db
    .select({ id: evaluationRubrics.id, version: evaluationRubrics.version })
    .from(evaluationRubrics)
    .where(
      and(
        eq(evaluationRubrics.workspaceId, workspaceId),
        eq(evaluationRubrics.jobId, jobId),
        eq(evaluationRubrics.status, "published"),
      ),
    )
    .orderBy(desc(evaluationRubrics.version))
    .limit(1);
  if (!rubric) return null;
  const criteria = await db
    .select()
    .from(evaluationCriteria)
    .where(eq(evaluationCriteria.rubricId, rubric.id));
  return {
    version: `job-rubric-v${rubric.version}`,
    criteria: criteria.map((criterion) => ({
      key: criterion.key,
      label: criterion.label,
      type: criterion.type as RulesRubric["criteria"][number]["type"],
      importance: criterion.importance as RulesRubric["criteria"][number]["importance"],
      weight: criterion.weight,
      aliases: Array.isArray(criterion.aliases) ? (criterion.aliases as string[]) : [],
      minimumValue: criterion.minimumValue ?? undefined,
    })),
  };
}

export async function enqueueCandidateEvaluationJob(input: {
  workspaceId: string;
  applicationId: string;
  candidateId: string;
  jobId: string;
}) {
  const [job] = await db
    .insert(evaluationJobs)
    .values({
      ...input,
      dedupeKey: `application:${input.applicationId}`,
      status: "pending",
    })
    .onConflictDoNothing({
      target: [evaluationJobs.workspaceId, evaluationJobs.dedupeKey],
    })
    .returning({ id: evaluationJobs.id });

  if (job) return job;
  const [existing] = await db
    .select({ id: evaluationJobs.id })
    .from(evaluationJobs)
    .where(
      and(
        eq(evaluationJobs.workspaceId, input.workspaceId),
        eq(evaluationJobs.dedupeKey, `application:${input.applicationId}`),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("Could not enqueue candidate evaluation.");
  return existing;
}

export async function markEvaluationJobRunning(id: string, workerId: string) {
  await db
    .update(evaluationJobs)
    .set({
      status: "running",
      attempts: sql`${evaluationJobs.attempts} + 1`,
      startedAt: new Date(),
      lockedAt: new Date(),
      lockedBy: workerId,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(evaluationJobs.id, id));
}

export async function markEvaluationJobCompleted(id: string) {
  await db
    .update(evaluationJobs)
    .set({
      status: "completed",
      nextRetryAt: null,
      completedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(evaluationJobs.id, id));
}

export async function markEvaluationJobFailed(id: string, error: string) {
  const [job] = await db
    .select({ attempts: evaluationJobs.attempts })
    .from(evaluationJobs)
    .where(eq(evaluationJobs.id, id))
    .limit(1);
  const attempts = job?.attempts ?? 1;
  const deadLetter = attempts >= 8;
  const retryAt = new Date(
    Date.now() + Math.min(60 * 60_000, 60_000 * 2 ** Math.min(attempts, 6)),
  );
  await db
    .update(evaluationJobs)
    .set({
      status: deadLetter ? "dead_letter" : "failed",
      nextRetryAt: deadLetter ? null : retryAt,
      lastError: error.slice(0, 1000),
      lockedAt: null,
      lockedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(evaluationJobs.id, id));
}

export async function claimDueEvaluationJobs(input: {
  workerId: string;
  limit?: number;
  lockTtlMs?: number;
}) {
  const now = new Date();
  const reclaimBefore = new Date(now.getTime() - (input.lockTtlMs ?? 10 * 60_000));
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(evaluationJobs)
      .where(
        and(
          or(eq(evaluationJobs.status, "pending"), eq(evaluationJobs.status, "failed")),
          or(isNull(evaluationJobs.nextRetryAt), lte(evaluationJobs.nextRetryAt, now)),
          or(isNull(evaluationJobs.lockedAt), lte(evaluationJobs.lockedAt, reclaimBefore)),
        ),
      )
      .limit(input.limit ?? 25)
      .for("update", { skipLocked: true });
    if (rows.length === 0) return rows;
    await tx
      .update(evaluationJobs)
      .set({
        status: "running",
        attempts: sql`${evaluationJobs.attempts} + 1`,
        lockedAt: now,
        lockedBy: input.workerId,
        startedAt: now,
        updatedAt: now,
      })
      .where(inArray(evaluationJobs.id, rows.map((row) => row.id)));
    return rows;
  });
}
