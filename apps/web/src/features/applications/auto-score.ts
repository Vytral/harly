import "server-only";

import { and, desc, eq } from "drizzle-orm";

import {
  activityEvents,
  applicationAnswers,
  applicationQuestions,
  applications,
  candidateFiles,
  candidates,
  db,
  jobs,
  workspaceSettings,
} from "@harly/db";

import { storage } from "@/lib/storage";
import { extractResumeText } from "@/lib/resume/extract-text";
import { resumeKeyFromUrl } from "@/lib/resume/storage-key";
import { maxResumeFileSize } from "@/lib/storage-validation";
import { getWorkspaceAiConfig } from "@/lib/ai/config";
import { logAiCandidateDecision } from "@/lib/ai/governance";
import { scoreCandidateWithAI } from "@/lib/ai/surfaces/score-candidate";
import {
  evaluateCandidateWithRules,
  RULES_EVALUATION_VERSION,
} from "@/lib/evaluation/rules";
import {
  enqueueCandidateEvaluationJob,
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

    // Load resume text.
    const [file] = await db
      .select({ fileName: candidateFiles.fileName, fileUrl: candidateFiles.fileUrl })
      .from(candidateFiles)
      .where(
        and(
          eq(candidateFiles.workspaceId, workspaceId),
          eq(candidateFiles.candidateId, row.candidateId),
        ),
      )
      .orderBy(desc(candidateFiles.createdAt))
      .limit(1);

    let resumeText: string | null = null;
    if (file) {
      const key = resumeKeyFromUrl(file.fileUrl);
      if (key) {
        try {
          const buffer = await storage.read(key);
          if (buffer.byteLength > 0 && buffer.byteLength <= maxResumeFileSize) {
            const { text } = await extractResumeText({ buffer, fileName: file.fileName });
            resumeText = text.trim() || null;
          }
        } catch {
          // Resume unavailable , score from profile only.
        }
      }
    }

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

    const scoreInput = {
      job: {
        title: row.jobTitle,
        description: row.jobDescription,
        requirements: row.jobRequirements,
        sector: row.jobSector,
        experienceLevel: row.jobExperienceLevel,
        education: row.jobEducation,
        keywords: Array.isArray(row.jobKeywords) ? (row.jobKeywords as string[]) : [],
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
      engineVersion: aiConfig?.modelId ?? RULES_EVALUATION_VERSION,
      rubricVersion: rulesEvaluation?.rubric.version ?? "ai-generated",
      rubricSnapshot: rulesEvaluation?.rubric ?? null,
      result,
      criterionResults: rulesEvaluation?.criterionResults,
      evidenceCoverage: rulesEvaluation?.evidenceCoverage,
      confidence: rulesEvaluation?.confidence,
      requiresHumanReview: rulesEvaluation?.requiresHumanReview ?? true,
      usedResume: resumeText !== null,
      generatedById: null,
      inputFingerprintSource: scoreInput,
    });

    await db.insert(activityEvents).values({
      workspaceId,
      actorId: null,
      entityType: "application",
      entityId: row.applicationId,
      type: source === "ai" ? "evaluation.ai_generated" : "evaluation.rules_generated",
      metadata: {
        score: result.score,
        recommendation: result.recommendation,
        jobTitle: row.jobTitle,
        source,
        auto: true,
        inputHash: persisted.inputHash,
      },
    });

    if (!aiConfig) {
      await markEvaluationJobCompleted(queueJob.id);
      return;
    }
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
