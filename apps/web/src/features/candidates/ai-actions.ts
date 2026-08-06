"use server";

import { revalidatePath } from "next/cache";
import { and, eq, notInArray } from "drizzle-orm";
import { z } from "zod";

import {
  activityEvents,
  aiEvaluations,
  applicationAnswers,
  applicationQuestions,
  applications,
  candidates,
  db,
  jobs,
} from "@harly/db";

import {
  getRolePolicy,
  requireCandidatePermission,
  requireApplicationPermission,
  requireJobPermission,
} from "@/features/workspaces/permissions-server";
import { getWorkspaceAiConfig } from "@/lib/ai/config";
import { logAiCandidateDecision } from "@/lib/ai/governance";
import { scoreCandidateWithAI } from "@/lib/ai/surfaces/score-candidate";
import {
  evaluateCandidateWithRules,
  RULES_EVALUATION_VERSION,
} from "@/lib/evaluation/rules";
import {
  getPublishedRulesRubric,
  persistCandidateEvaluation,
} from "@/features/evaluations/service";
import { loadResumeText } from "@/lib/resume/load-resume-text";
import { enforceRateLimit } from "@/server/api/ratelimit";
import type { EvaluationMode } from "@/lib/evaluation/mode";
import {
  detectCandidateDuplicatesForWorkspace,
  type DuplicateMatch,
} from "@/features/candidates/duplicate-detection";

const generateSchema = z.object({
  applicationId: z.uuid(),
});

export type GenerateAiEvaluationResult =
  | { success: true }
  | { success: false; error: string; reason?: "not_configured" };

/** Generate (or regenerate) the AI fit evaluation for one application. */
export async function generateAiEvaluationAction(input: {
  applicationId: string;
}): Promise<GenerateAiEvaluationResult> {
  const parsed = generateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid application." };
  }

  let context;
  try {
    context = await requireApplicationPermission(
      "collab:write",
      parsed.data.applicationId,
    );
  } catch {
    return {
      success: false,
      error: "You do not have permission to run automatic evaluations.",
    };
  }
  const workspaceId = context.organization.id;
  try {
    await enforceRateLimit(`ai-score:${workspaceId}:${context.user.id}`, {
      limit: 30,
      windowMs: 10 * 60_000,
    });
  } catch {
    return {
      success: false,
      error: "Too many scoring requests. Slow down and try again shortly.",
    };
  }

  const [row] = await db
    .select({
      applicationId: applications.id,
      candidateId: candidates.id,
      jobId: jobs.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      headline: candidates.headline,
      location: candidates.location,
      skills: candidates.skills,
      experienceYears: candidates.experienceYears,
      jobTitle: jobs.title,
      jobDescription: jobs.description,
      jobRequirements: jobs.requirements,
      jobSector: jobs.sector,
      jobExperienceLevel: jobs.experienceLevel,
      jobEducation: jobs.education,
      jobKeywords: jobs.keywords,
      evaluationMode: jobs.evaluationMode,
    })
    .from(applications)
    .innerJoin(
      candidates,
      and(
        eq(candidates.workspaceId, workspaceId),
        eq(candidates.id, applications.candidateId),
      ),
    )
    .innerJoin(
      jobs,
      and(eq(jobs.workspaceId, workspaceId), eq(jobs.id, applications.jobId)),
    )
    .where(
      and(
        eq(applications.workspaceId, workspaceId),
        eq(applications.id, parsed.data.applicationId),
      ),
    )
    .limit(1);

  if (!row) {
    return { success: false, error: "Application not found." };
  }

  const aiConfig = await getWorkspaceAiConfig(workspaceId);
  const evaluationMode: EvaluationMode = row.evaluationMode === "relaxed" || row.evaluationMode === "strict"
    ? row.evaluationMode
    : "balanced";
  const candidateSkills = Array.isArray(row.skills)
    ? (row.skills as string[])
    : [];
  const [resume, answerRows] = await Promise.all([
    loadResumeText({ workspaceId, candidateId: row.candidateId }),
    db
      .select({
        question: applicationQuestions.label,
        answer: applicationAnswers.answer,
      })
      .from(applicationAnswers)
      .innerJoin(
        applicationQuestions,
        and(
          eq(applicationQuestions.workspaceId, workspaceId),
          eq(applicationQuestions.id, applicationAnswers.questionId),
        ),
      )
      .where(
        and(
          eq(applicationAnswers.workspaceId, workspaceId),
          eq(applicationAnswers.applicationId, row.applicationId),
        ),
      )
      .orderBy(applicationQuestions.order),
  ]);

  try {
    const scoreInput = {
      job: {
        title: row.jobTitle,
        description: row.jobDescription,
        requirements: row.jobRequirements,
        sector: row.jobSector,
        experienceLevel: row.jobExperienceLevel,
        education: row.jobEducation,
        keywords: Array.isArray(row.jobKeywords)
          ? (row.jobKeywords as string[])
          : [],
        evaluationMode,
      },
      candidate: {
        fullName: `${row.firstName} ${row.lastName}`,
        headline: row.headline,
        location: row.location,
        resumeText: resume.text,
        answers: answerRows,
        skills: candidateSkills,
        experienceYears: row.experienceYears,
      },
    };
    const source = aiConfig ? "ai" : "rules";
    const publishedRubric = aiConfig
      ? null
      : await getPublishedRulesRubric(workspaceId, row.jobId);
    const rulesEvaluation = aiConfig
      ? null
      : evaluateCandidateWithRules({ ...scoreInput, rubric: publishedRubric ?? undefined });
    const result = aiConfig
      ? await scoreCandidateWithAI(aiConfig, scoreInput)
      : rulesEvaluation!.result;

    const persisted = await persistCandidateEvaluation({
      workspaceId,
      candidateId: row.candidateId,
      applicationId: row.applicationId,
      jobId: row.jobId,
      source,
      provider: aiConfig?.provider ?? "harly",
      modelId: aiConfig?.modelId ?? RULES_EVALUATION_VERSION,
      engine: aiConfig ? "provider-ai" : "harly-rules",
      engineVersion: aiConfig
        ? `${aiConfig.modelId}:${evaluationMode}`
        : `${RULES_EVALUATION_VERSION}:${evaluationMode}`,
      rubricVersion: rulesEvaluation?.rubric.version ?? "ai-generated",
      rubricSnapshot: rulesEvaluation?.rubric ?? null,
      result,
      criterionResults: rulesEvaluation?.criterionResults,
      evidenceCoverage: rulesEvaluation?.evidenceCoverage,
      confidence: rulesEvaluation?.confidence,
      requiresHumanReview: rulesEvaluation?.requiresHumanReview ?? true,
      usedResume: resume.text !== null,
      generatedById: context.user.id,
      inputFingerprintSource: scoreInput,
    });

    await db.insert(activityEvents).values({
      workspaceId,
      actorId: context.user.id,
      entityType: "application",
      entityId: row.applicationId,
      type: source === "ai" ? "evaluation.ai_generated" : "evaluation.rules_generated",
      metadata: {
        score: result.score,
        recommendation: result.recommendation,
        jobTitle: row.jobTitle,
        source,
        inputHash: persisted.inputHash,
      },
    });

    if (aiConfig) await logAiCandidateDecision({
      workspaceId,
      candidateId: row.candidateId,
      applicationId: row.applicationId,
      jobId: row.jobId,
      provider: aiConfig.provider,
      modelId: aiConfig.modelId,
      actor: { id: context.user.id, email: context.user.email },
      inputFingerprintSource: scoreInput,
      outputFingerprintSource: result,
      inputSummary: {
        usedResume: resume.text !== null,
        answerCount: answerRows.length,
        skillsCount: candidateSkills.length,
      },
      outputSummary: {
        score: result.score,
        recommendation: result.recommendation,
        criteriaCount: result.criteria.length,
      },
    });

    revalidatePath(`/dashboard/candidates/${row.candidateId}`);
    return { success: true };
  } catch (error) {
    console.error("Automatic evaluation failed", error);
    return {
      success: false,
      error:
        "The automatic evaluation failed. Check the evaluation configuration and try again.",
    };
  }
}

// ── Bulk scoring ────────────────────────────────────────────────────────────

export type BulkGenerateResult =
  | { success: true; succeeded: number; failed: number; remaining: number }
  | { success: false; error?: string; reason?: "not_configured" };

const BULK_BATCH_SIZE = 25;

const bulkSchema = z.object({ jobId: z.uuid() });

/**
 * Score up to BULK_BATCH_SIZE unscored applicants for a given job.
 * Returns how many remain so the caller can loop until 0.
 */
export async function bulkGenerateAiEvaluationsForJobAction(input: {
  jobId: string;
}): Promise<BulkGenerateResult> {
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid job." };
  }

  let context;
  try {
    context = await requireJobPermission("collab:write", parsed.data.jobId);
  } catch {
    return { success: false, error: "Permission denied." };
  }
  const workspaceId = context.organization.id;

  // Bound abuse: a member with collab:write could otherwise loop bulk scoring
  // and drain the workspace's AI key (IA-01).
  try {
    await enforceRateLimit(`bulk-ai:${workspaceId}`, {
      limit: 20,
      windowMs: 10 * 60_000,
    });
  } catch {
    return {
      success: false,
      error: "Too many bulk scoring requests. Slow down and try again shortly.",
    };
  }

  const aiConfig = await getWorkspaceAiConfig(workspaceId);
  const currentEvaluationSource = aiConfig ? "ai" : "rules";
  const [job] = await db
    .select({ evaluationMode: jobs.evaluationMode })
    .from(jobs)
    .where(
      and(eq(jobs.id, parsed.data.jobId), eq(jobs.workspaceId, workspaceId)),
    )
    .limit(1);
  const evaluationMode: EvaluationMode = job?.evaluationMode === "relaxed" || job?.evaluationMode === "strict"
    ? job.evaluationMode
    : "balanced";
  const currentEvaluationVersion = aiConfig
    ? `${aiConfig.modelId}:${evaluationMode}`
    : `${RULES_EVALUATION_VERSION}:${evaluationMode}`;

  // Re-score applications without an evaluation or with an obsolete engine
  // version. This makes rubric/engine improvements actually reach existing
  // candidates instead of leaving stale scores visible forever.
  const scoredIds = db
    .select({ applicationId: aiEvaluations.applicationId })
    .from(aiEvaluations)
    .where(
      and(
        eq(aiEvaluations.workspaceId, workspaceId),
        eq(aiEvaluations.source, currentEvaluationSource),
        eq(aiEvaluations.engineVersion, currentEvaluationVersion),
      ),
    );

  const unscoredApps = await db
    .select({ applicationId: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.workspaceId, workspaceId),
        eq(applications.jobId, parsed.data.jobId),
        eq(applications.status, "active"),
        notInArray(applications.id, scoredIds),
      ),
    );

  // The job permission is necessary but not sufficient: a candidate can be
  // deleted or otherwise unavailable even when the job itself is assigned.
  // Authorize every application in the batch before starting any provider
  // call, so a mixed-scope request cannot partially score candidates.
  try {
    await Promise.all(
      unscoredApps.map(({ applicationId }) =>
        requireApplicationPermission("collab:write", applicationId),
      ),
    );
  } catch {
    return { success: false, error: "Permission denied." };
  }

  const remaining = Math.max(0, unscoredApps.length - BULK_BATCH_SIZE);
  const batch = unscoredApps.slice(0, BULK_BATCH_SIZE);

  // Run up to 5 concurrent scoring calls.
  const CONCURRENCY = 5;
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < batch.length; i += CONCURRENCY) {
    const chunk = batch.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map(({ applicationId }) =>
        generateAiEvaluationAction({ applicationId }),
      ),
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.success) {
        succeeded++;
      } else {
        failed++;
      }
    }
  }

  return { success: true, succeeded, failed, remaining };
}

// ── Duplicate detection ─────────────────────────────────────────────────────

export type { DuplicateMatch } from "@/features/candidates/duplicate-detection";

export type DetectDuplicatesResult =
  | { ok: true; matches: DuplicateMatch[] }
  | { ok: false; error: string };

const detectSchema = z.object({ candidateId: z.uuid() });

/**
 * Use AI to compare a candidate against name-alike candidates in the workspace
 * and return confidence-ranked duplicate matches.
 */
export async function detectCandidateDuplicatesAction(input: {
  candidateId: string;
}): Promise<DetectDuplicatesResult> {
  const parsed = detectSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid candidate." };
  }

  let context;
  try {
    context = await requireCandidatePermission(
      "collab:write",
      parsed.data.candidateId,
    );
    const scope = (await getRolePolicy(
      context.organization.id,
      context.roleKey,
    )).scope;
    if (
      scope.jobAccess !== "all" ||
      scope.departments.length > 0 ||
      scope.regions.length > 0
    ) {
      return {
        ok: false,
        error: "Duplicate detection requires workspace-wide candidate access.",
      };
    }
  } catch {
    return {
      ok: false,
      error: "You do not have permission to run AI duplicate detection.",
    };
  }
  const workspaceId = context.organization.id;

  const aiConfig = await getWorkspaceAiConfig(workspaceId);
  if (!aiConfig) {
    return { ok: false, error: "AI is not configured for this workspace." };
  }

  try {
    const matches = await detectCandidateDuplicatesForWorkspace({
      workspaceId,
      candidateId: parsed.data.candidateId,
      config: aiConfig,
    });
    return { ok: true, matches };
  } catch (error) {
    console.error("Duplicate detection AI call failed", error);
    return {
      ok: false,
      error: "AI duplicate detection failed. Try again later.",
    };
  }
}
