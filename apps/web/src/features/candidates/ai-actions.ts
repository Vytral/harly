"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

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
} from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { getWorkspaceAiConfig } from "@/lib/ai/config";
import { scoreCandidateWithAI } from "@/lib/ai/surfaces/score-candidate";
import { extractResumeText } from "@/lib/resume/extract-text";
import { storage } from "@/lib/storage";
import { maxResumeFileSize } from "@/lib/storage-validation";

const generateSchema = z.object({
  applicationId: z.uuid(),
});

/**
 * Recover a storage key from a stored file URL. Local files are saved as
 * `/uploads/<key>`; S3 URLs keep the key in the path. Returns null when no
 * `resumes/` key can be recovered.
 */
function resumeKeyFromUrl(fileUrl: string): string | null {
  const path = fileUrl.startsWith("/")
    ? fileUrl
    : (() => {
        try {
          return new URL(fileUrl).pathname;
        } catch {
          return fileUrl;
        }
      })();
  const marker = path.indexOf("resumes/");
  if (marker === -1) return null;
  const key = path.slice(marker);
  return key.includes("..") ? null : key;
}

async function loadResumeText(input: {
  workspaceId: string;
  candidateId: string;
}): Promise<{ text: string | null; fileName: string | null }> {
  const [file] = await db
    .select({
      fileName: candidateFiles.fileName,
      fileUrl: candidateFiles.fileUrl,
    })
    .from(candidateFiles)
    .where(
      and(
        eq(candidateFiles.workspaceId, input.workspaceId),
        eq(candidateFiles.candidateId, input.candidateId),
      ),
    )
    .orderBy(desc(candidateFiles.createdAt))
    .limit(1);

  if (!file) return { text: null, fileName: null };

  const key = resumeKeyFromUrl(file.fileUrl);
  if (!key) return { text: null, fileName: file.fileName };

  try {
    const buffer = await storage.read(key);
    if (buffer.byteLength === 0 || buffer.byteLength > maxResumeFileSize) {
      return { text: null, fileName: file.fileName };
    }
    const { text } = await extractResumeText({
      buffer,
      fileName: file.fileName,
    });
    return { text: text.trim() ? text : null, fileName: file.fileName };
  } catch (error) {
    console.error("Could not read resume for AI evaluation", error);
    return { text: null, fileName: file.fileName };
  }
}

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
    context = await requirePermission("collab:write");
  } catch {
    return {
      success: false,
      error: "You do not have permission to run AI evaluations.",
    };
  }
  const workspaceId = context.organization.id;

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
        eq(applications.id, parsed.data.applicationId),
      ),
    )
    .limit(1);

  if (!row) {
    return { success: false, error: "Application not found." };
  }

  const aiConfig = await getWorkspaceAiConfig(workspaceId);
  if (!aiConfig) {
    return {
      success: false,
      error: "AI is not configured for this workspace.",
      reason: "not_configured",
    };
  }

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
    const result = await scoreCandidateWithAI(aiConfig, {
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
      },
      candidate: {
        fullName: `${row.firstName} ${row.lastName}`,
        headline: row.headline,
        location: row.location,
        resumeText: resume.text,
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
      usedResume: resume.text !== null,
      generatedById: context.user.id,
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
      actorId: context.user.id,
      entityType: "application",
      entityId: row.applicationId,
      type: "evaluation.ai_generated",
      metadata: {
        score: result.score,
        recommendation: result.recommendation,
        jobTitle: row.jobTitle,
      },
    });

    revalidatePath(`/dashboard/candidates/${row.candidateId}`);
    return { success: true };
  } catch (error) {
    console.error("AI evaluation failed", error);
    return {
      success: false,
      error:
        "The AI evaluation failed. Check the provider key in Settings → AI and try again.",
    };
  }
}
