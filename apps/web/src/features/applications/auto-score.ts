import "server-only";

import { and, desc, eq } from "drizzle-orm";

import {
  activityEvents,
  aiEvaluations,
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
import { maxResumeFileSize } from "@/lib/storage-validation";
import { getWorkspaceAiConfig } from "@/lib/ai/config";
import { scoreCandidateWithAI } from "@/lib/ai/surfaces/score-candidate";

function resumeKeyFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const key = parsed.pathname.replace(/^\//, "");
    return key.startsWith("resumes/") && !key.includes("..") ? key : null;
  } catch {
    const match = url.match(/(resumes\/[^?#]+)/);
    return match?.[1] ?? null;
  }
}

/**
 * Fire-and-forget: score a new application if auto-score is enabled for the
 * workspace. Never throws — failures are logged only.
 */
export async function scheduleAutoScore(
  applicationId: string,
  workspaceId: string,
): Promise<void> {
  try {
    // Check auto-score setting first — cheap query, skip early if disabled.
    const [settings] = await db
      .select({ aiAutoScore: workspaceSettings.aiAutoScore })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, workspaceId))
      .limit(1);

    if (!settings?.aiAutoScore) return;

    const aiConfig = await getWorkspaceAiConfig(workspaceId);
    if (!aiConfig) return;

    const [row] = await db
      .select({
        applicationId: applications.id,
        candidateId: candidates.id,
        jobId: jobs.id,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        headline: candidates.headline,
        location: candidates.location,
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
          // Resume unavailable — score from profile only.
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

    const result = await scoreCandidateWithAI(aiConfig, {
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
      },
    });

    const values = {
      workspaceId,
      candidateId: row.candidateId,
      applicationId: row.applicationId,
      jobId: row.jobId,
      provider: aiConfig.provider,
      modelId: aiConfig.modelId,
      score: result.score,
      recommendation: result.recommendation,
      summary: result.summary,
      strengths: result.strengths,
      gaps: result.gaps,
      criteria: result.criteria,
      usedResume: resumeText !== null,
      generatedById: null,
    };

    await db
      .insert(aiEvaluations)
      .values(values)
      .onConflictDoUpdate({
        target: [aiEvaluations.workspaceId, aiEvaluations.applicationId],
        set: { ...values, updatedAt: new Date() },
      });

    await db.insert(activityEvents).values({
      workspaceId,
      actorId: null,
      entityType: "application",
      entityId: row.applicationId,
      type: "evaluation.ai_generated",
      metadata: {
        score: result.score,
        recommendation: result.recommendation,
        jobTitle: row.jobTitle,
        auto: true,
      },
    });
  } catch (error) {
    console.error("Auto-score failed for application", applicationId, error);
  }
}
