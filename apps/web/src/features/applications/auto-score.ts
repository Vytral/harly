import "server-only";

import { and, eq } from "drizzle-orm";

import {
  activityEvents,
  applicationAnswers,
  applicationQuestions,
  applications,
  candidates,
  db,
  jobs,
  workspaceSettings,
} from "@harly/db";

import { loadResumeDocument } from "@/lib/resume/load-resume-text";
import { getWorkspaceAiConfig } from "@/lib/ai/config";
import { logAiCandidateDecision } from "@/lib/ai/governance";
import { scoreCandidateWithAI } from "@/lib/ai/surfaces/score-candidate";
import {
  evaluateCandidateWithRulesAsync,
  RULES_EVALUATION_VERSION,
} from "@/lib/evaluation/rules";
import type { EvaluationMode } from "@/lib/evaluation/mode";
import {
  enqueueCandidateEvaluationJob,
  findReusableCandidateFacts,
  getPublishedRulesRubric,
  markEvaluationJobCompleted,
  markEvaluationJobFailed,
  markEvaluationJobRunning,
  persistCandidateEvaluation,
} from "@/features/evaluations/service";

/**
 * Fire-and-forget: score a new application if auto-score is enabled for the
 * workspace. Never throws , failures are logged only.
 */
export async function scheduleAutoScore(
  applicationId: string,
  workspaceId: string,
  options?: { jobId?: string; workerId?: string },
): Promise<void> {
  let evaluationJobId: string | null = options?.jobId ?? null;
  try {
    // Check auto-score setting first , cheap query, skip early if disabled.
    const [settings] = await db
      .select({ aiAutoScore: workspaceSettings.aiAutoScore })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, workspaceId))
      .limit(1);

    if (!settings?.aiAutoScore) {
      if (evaluationJobId) await markEvaluationJobCompleted(evaluationJobId);
      return;
    }

    const aiConfig = await getWorkspaceAiConfig(workspaceId);

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
        appliedAt: applications.appliedAt,
        applicationCreatedAt: applications.createdAt,
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
          eq(applications.id, applicationId),
        ),
      )
      .limit(1);

    if (!row) return;

    const queueJob = evaluationJobId
      ? { id: evaluationJobId }
      : await enqueueCandidateEvaluationJob({
          workspaceId,
          applicationId: row.applicationId,
          candidateId: row.candidateId,
          jobId: row.jobId,
        });
    evaluationJobId = queueJob.id;
    if (!options?.jobId) {
      await markEvaluationJobRunning(queueJob.id, `inline:${workspaceId}`);
    }

    // Load resume text + layout document (Phase 4 §6). Unreadable sources
    // resolve to text: null -> profile-only evaluation with human review.
    const resume = await loadResumeDocument({ workspaceId, candidateId: row.candidateId });
    const resumeText = resume.text;
    const referenceDateValue = row.appliedAt ?? row.applicationCreatedAt;
    const parsedReferenceDate = referenceDateValue ? new Date(referenceDateValue) : null;
    const pinnedReferenceDate = parsedReferenceDate && !Number.isNaN(parsedReferenceDate.getTime())
      ? parsedReferenceDate.toISOString()
      : "1970-01-01T00:00:00.000Z";
    // Load question answers.
    const answerRows = await db
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
      .orderBy(applicationQuestions.order);

    const evaluationMode: EvaluationMode =
      row.evaluationMode === "relaxed" || row.evaluationMode === "strict"
        ? row.evaluationMode
        : "balanced";
    const scoreInput = {
      job: {
        title: row.jobTitle,
        description: row.jobDescription,
        requirements: row.jobRequirements,
        sector: row.jobSector,
        experienceLevel: row.jobExperienceLevel,
        education: row.jobEducation,
        keywords: Array.isArray(row.jobKeywords) ? (row.jobKeywords as string[]) : [],
        evaluationMode,
      },
      candidate: {
        fullName: `${row.firstName} ${row.lastName}`,
        headline: row.headline,
        location: row.location,
        resumeText,
        answers: answerRows,
        skills: Array.isArray(row.skills) ? (row.skills as string[]) : [],
        experienceYears: row.experienceYears,
      },
      // Pin current-role math to an immutable application event. A missing
      // appliedAt must not silently fall through to wall-clock time.
      referenceDate: pinnedReferenceDate,
      sourceDocument: resume.document ?? undefined,
    };
    // Rules-first + AI overlay with rules fallback (see ai-actions.ts).
    // Never fail the entire auto-score solely because the AI provider failed.
    const publishedRubric = await getPublishedRulesRubric(workspaceId, row.jobId);
    const reusableFacts = await findReusableCandidateFacts({
      workspaceId,
      applicationId,
      resumeText,
    });
    const rulesEvaluation = await evaluateCandidateWithRulesAsync({
      ...scoreInput,
      rubric: publishedRubric ?? undefined,
      candidateFacts: reusableFacts ?? undefined,
    });

    let source: "ai" | "rules" = "rules";
    let result = rulesEvaluation.result;
    if (aiConfig) {
      try {
        result = await scoreCandidateWithAI(aiConfig, scoreInput);
        source = "ai";
      } catch (aiError) {
        console.warn(
          "Auto-score AI unavailable; falling back to deterministic rules",
          aiError,
        );
        source = "rules";
        result = rulesEvaluation.result;
      }
    }
    const persisted = await persistCandidateEvaluation({
      workspaceId,
      candidateId: row.candidateId,
      applicationId: row.applicationId,
      jobId: row.jobId,
      source,
      provider: source === "ai" && aiConfig ? aiConfig.provider : "harly",
      modelId: source === "ai" && aiConfig ? aiConfig.modelId : RULES_EVALUATION_VERSION,
      engine: source === "ai" ? "provider-ai" : "harly-rules",
      engineVersion: source === "ai" && aiConfig ? aiConfig.modelId : RULES_EVALUATION_VERSION,
      rubricVersion: rulesEvaluation.rubric.version,
      rubricSnapshot: rulesEvaluation.rubric,
      result,
      criterionResults: rulesEvaluation.criterionResults,
      candidateFactsSnapshot: rulesEvaluation.candidateFacts,
      skillProfilesSnapshot: rulesEvaluation.skillProfiles,
      evaluationMetadataSnapshot: rulesEvaluation.metadata,
      criterionDetailsSnapshot: rulesEvaluation.criterionAssessments,
      impactHighlightsSnapshot: rulesEvaluation.impactHighlights,
      evidenceCoverage: rulesEvaluation.evidenceCoverage,
      confidence: rulesEvaluation.confidence,
      requiresHumanReview: rulesEvaluation.requiresHumanReview || source === "ai",
      usedResume: resumeText !== null,
      generatedById: null,
      inputFingerprintSource: scoreInput,
    });

    await db.insert(activityEvents).values({
      workspaceId,
      actorId: null,
      entityType: "application",
      entityId: row.applicationId,
      type:
        source === "ai"
          ? "evaluation.ai_generated"
          : "evaluation.rules_generated",
      metadata: {
        score: result.score,
        recommendation: result.recommendation,
        jobTitle: row.jobTitle,
        source,
        auto: true,
        inputHash: persisted.inputHash,
      },
    });

    if (source === "ai" && aiConfig) {
      await logAiCandidateDecision({
        workspaceId,
        candidateId: row.candidateId,
        applicationId: row.applicationId,
        jobId: row.jobId,
        provider: aiConfig.provider,
        modelId: aiConfig.modelId,
        inputFingerprintSource: scoreInput,
        outputFingerprintSource: result,
        inputSummary: {
          usedResume: resumeText !== null,
          answerCount: answerRows.length,
          skillsCount: Array.isArray(row.skills) ? row.skills.length : 0,
        },
        outputSummary: {
          score: result.score,
          recommendation: result.recommendation,
          criteriaCount: result.criteria.length,
        },
      });
    }
    await markEvaluationJobCompleted(queueJob.id);
  } catch (error) {
    if (evaluationJobId) {
      await markEvaluationJobFailed(
        evaluationJobId,
        error instanceof Error ? error.message : "Automatic evaluation failed.",
      );
    }
    console.error("Auto-score failed for application", applicationId, error);
    if (options?.jobId) throw error;
  }
}

/**
 * Execute candidate scoring within an automation workflow action.
 * Evaluates the application against its job using deterministic rules first,
 * with optional AI overlay and rules fallback, persisting the evaluation and activity event.
 */
export async function evaluateApplicationForWorkflow(input: {
  workspaceId: string;
  applicationId: string;
  actorUserId?: string | null;
  database?: typeof db;
  /**
   * The workflow run causing this evaluation, if any. Propagated as
   * `parentRunId` on the `evaluation.completed` event so the existing
   * lineage-depth guard in dispatchWorkflowEvent (MAX_LINEAGE_DEPTH) can stop
   * a workflow that re-triggers ai_score on its own evaluation output from
   * looping indefinitely. Omitted for callers outside a workflow run (e.g.
   * scheduleAutoScore's direct auto-score-on-create path).
   */
  runId?: string;
}): Promise<{
  success: boolean;
  score?: number;
  recommendation?: string;
  evaluationId?: string;
  error?: string;
}> {
  const database = input.database ?? db;
  const workspaceId = input.workspaceId;

  try {
    const [row] = await database
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
        appliedAt: applications.appliedAt,
        applicationCreatedAt: applications.createdAt,
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
          eq(applications.id, input.applicationId),
        ),
      )
      .limit(1);

    if (!row) {
      return { success: false, error: "Application not found for evaluation." };
    }

    const aiConfig = await getWorkspaceAiConfig(workspaceId);

    // Same resume path as scheduleAutoScore — never re-inline storage/parser symbols.
    const resume = await loadResumeDocument({
      workspaceId,
      candidateId: row.candidateId,
    });
    const resumeText = resume.text;
    const referenceDateValue = row.appliedAt ?? row.applicationCreatedAt;
    const parsedReferenceDate = referenceDateValue
      ? new Date(referenceDateValue)
      : null;
    const pinnedReferenceDate =
      parsedReferenceDate && !Number.isNaN(parsedReferenceDate.getTime())
        ? parsedReferenceDate.toISOString()
        : "1970-01-01T00:00:00.000Z";

    const answerRows = await database
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
      .orderBy(applicationQuestions.order);

    const evaluationMode: EvaluationMode =
      row.evaluationMode === "relaxed" || row.evaluationMode === "strict"
        ? row.evaluationMode
        : "balanced";

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
        resumeText,
        answers: answerRows,
        skills: Array.isArray(row.skills) ? (row.skills as string[]) : [],
        experienceYears: row.experienceYears,
      },
      referenceDate: pinnedReferenceDate,
      sourceDocument: resume.document ?? undefined,
    };

    // Rules-first + AI overlay with rules fallback (parity with scheduleAutoScore).
    const publishedRubric = await getPublishedRulesRubric(
      workspaceId,
      row.jobId,
      database,
    );
    const reusableFacts = await findReusableCandidateFacts({
      workspaceId,
      applicationId: input.applicationId,
      resumeText,
    });
    const rulesEvaluation = await evaluateCandidateWithRulesAsync({
      ...scoreInput,
      rubric: publishedRubric ?? undefined,
      candidateFacts: reusableFacts ?? undefined,
    });

    let source: "ai" | "rules" = "rules";
    let result = rulesEvaluation.result;
    if (aiConfig) {
      try {
        result = await scoreCandidateWithAI(aiConfig, scoreInput);
        source = "ai";
      } catch (aiError) {
        console.warn(
          "Workflow auto-score AI unavailable; falling back to deterministic rules",
          aiError,
        );
        source = "rules";
        result = rulesEvaluation.result;
      }
    }

    const persisted = await persistCandidateEvaluation({
      workspaceId,
      candidateId: row.candidateId,
      applicationId: row.applicationId,
      jobId: row.jobId,
      source,
      provider: source === "ai" && aiConfig ? aiConfig.provider : "harly",
      modelId:
        source === "ai" && aiConfig ? aiConfig.modelId : RULES_EVALUATION_VERSION,
      engine: source === "ai" ? "provider-ai" : "harly-rules",
      engineVersion:
        source === "ai" && aiConfig ? aiConfig.modelId : RULES_EVALUATION_VERSION,
      rubricVersion: rulesEvaluation.rubric.version,
      rubricSnapshot: rulesEvaluation.rubric,
      result,
      criterionResults: rulesEvaluation.criterionResults,
      candidateFactsSnapshot: rulesEvaluation.candidateFacts,
      skillProfilesSnapshot: rulesEvaluation.skillProfiles,
      evaluationMetadataSnapshot: rulesEvaluation.metadata,
      criterionDetailsSnapshot: rulesEvaluation.criterionAssessments,
      impactHighlightsSnapshot: rulesEvaluation.impactHighlights,
      evidenceCoverage: rulesEvaluation.evidenceCoverage,
      confidence: rulesEvaluation.confidence,
      requiresHumanReview:
        rulesEvaluation.requiresHumanReview || source === "ai",
      usedResume: resumeText !== null,
      generatedById: input.actorUserId ?? null,
      inputFingerprintSource: scoreInput,
      database,
    });

    await database.insert(activityEvents).values({
      workspaceId,
      actorId: input.actorUserId ?? null,
      entityType: "application",
      entityId: row.applicationId,
      type:
        source === "ai"
          ? "evaluation.ai_generated"
          : "evaluation.rules_generated",
      metadata: {
        score: result.score,
        recommendation: result.recommendation,
        jobTitle: row.jobTitle,
        source,
        workflow: true,
        inputHash: persisted.inputHash,
      },
    });

    // Dynamic import breaks a module cycle: this function is itself invoked
    // from the automations engine (registry.ts's `ai_score` handler), which
    // is upstream of emitWebhookEvent -> dispatchWorkflowEvent -> engine.ts
    // -> registry.ts -> auto-score.ts. Emitting evaluation.completed lets a
    // downstream workflow branch on `ai.score`/`ai.recommendation` right
    // after this same evaluation, instead of only being readable via a later
    // read tool (AI16/telemetry follow-up).
    const { emitWebhookEvent } = await import("@/server/webhooks/emit");
    await emitWebhookEvent(
      workspaceId,
      "evaluation.completed",
      {
        application: { id: row.applicationId, jobId: row.jobId },
        candidate: { id: row.candidateId },
        evaluation: {
          id: persisted.id,
          score: result.score,
          recommendation: result.recommendation,
          source,
        },
      },
      {
        parentRunId: input.runId,
        database,
      },
    ).catch((error) =>
      console.error(
        "Failed to emit evaluation.completed",
        input.applicationId,
        error,
      ),
    );

    if (source === "ai" && aiConfig) {
      await logAiCandidateDecision({
        workspaceId,
        candidateId: row.candidateId,
        applicationId: row.applicationId,
        jobId: row.jobId,
        provider: aiConfig.provider,
        modelId: aiConfig.modelId,
        inputFingerprintSource: scoreInput,
        outputFingerprintSource: result,
        inputSummary: {
          usedResume: resumeText !== null,
          answerCount: answerRows.length,
          skillsCount: Array.isArray(row.skills) ? row.skills.length : 0,
        },
        outputSummary: {
          score: result.score,
          recommendation: result.recommendation,
          criteriaCount: result.criteria.length,
        },
      });
    }

    return {
      success: true,
      score: result.score,
      recommendation: result.recommendation,
      evaluationId: persisted.id,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Candidate evaluation failed.",
    };
  }
}
