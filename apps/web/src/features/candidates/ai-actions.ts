"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, ilike, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import { generateText } from "ai";
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
import { getModel } from "@/lib/ai/registry";
import { scoreCandidateWithAI } from "@/lib/ai/surfaces/score-candidate";
import { extractResumeText } from "@/lib/resume/extract-text";
import { resumeKeyFromUrl } from "@/lib/resume/storage-key";
import { storage } from "@/lib/storage";
import { maxResumeFileSize } from "@/lib/storage-validation";

const generateSchema = z.object({
  applicationId: z.uuid(),
});

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
    context = await requirePermission("collab:write");
  } catch {
    return { success: false, error: "Permission denied." };
  }
  const workspaceId = context.organization.id;

  const aiConfig = await getWorkspaceAiConfig(workspaceId);
  if (!aiConfig) {
    return {
      success: false,
      error: "AI is not configured for this workspace.",
      reason: "not_configured",
    };
  }

  // Find application IDs that don't have an evaluation yet.
  const scoredIds = db
    .select({ applicationId: aiEvaluations.applicationId })
    .from(aiEvaluations)
    .where(eq(aiEvaluations.workspaceId, workspaceId));

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
    )
    .limit(BULK_BATCH_SIZE + 1); // +1 to know if there are more

  const remaining = Math.max(0, unscoredApps.length - BULK_BATCH_SIZE);
  const batch = unscoredApps.slice(0, BULK_BATCH_SIZE);

  // Run up to 5 concurrent scoring calls.
  const CONCURRENCY = 5;
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < batch.length; i += CONCURRENCY) {
    const chunk = batch.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map(({ applicationId }) => generateAiEvaluationAction({ applicationId })),
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

export type DuplicateMatch = {
  candidateId: string;
  confidence: "high" | "medium";
  reason: string;
  fullName: string;
  email: string;
};

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
    context = await requirePermission("collab:write");
  } catch {
    return { ok: false, error: "You do not have permission to run AI duplicate detection." };
  }
  const workspaceId = context.organization.id;

  const aiConfig = await getWorkspaceAiConfig(workspaceId);
  if (!aiConfig) {
    return { ok: false, error: "AI is not configured for this workspace." };
  }

  // Load the target candidate.
  const [target] = await db
    .select({
      id: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      email: candidates.email,
      headline: candidates.headline,
    })
    .from(candidates)
    .where(and(eq(candidates.workspaceId, workspaceId), eq(candidates.id, parsed.data.candidateId)))
    .limit(1);

  if (!target) {
    return { ok: false, error: "Candidate not found." };
  }

  // Find candidates with similar names (heuristic pre-filter).
  const suspects = await db
    .select({
      id: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      email: candidates.email,
      headline: candidates.headline,
    })
    .from(candidates)
    .where(
      and(
        eq(candidates.workspaceId, workspaceId),
        ne(candidates.id, parsed.data.candidateId),
        isNull(candidates.deletedAt),
        or(
          ilike(candidates.firstName, `%${target.firstName}%`),
          ilike(candidates.lastName, `%${target.lastName}%`),
          sql`lower(${candidates.email}) = lower(${target.email})`,
        ),
      ),
    )
    .limit(10);

  if (suspects.length === 0) {
    return { ok: true, matches: [] };
  }

  // Build a prompt and ask the AI to classify each suspect.

  const targetBlock = `Target: ${target.firstName} ${target.lastName} <${target.email}>${target.headline ? ` — ${target.headline}` : ""}`;
  const suspectsBlock = suspects
    .map(
      (s, i) =>
        `${i + 1}. id=${s.id} name="${s.firstName} ${s.lastName}" email="${s.email}"${s.headline ? ` headline="${s.headline}"` : ""}`,
    )
    .join("\n");

  const prompt = [
    `You are a recruiting data-quality assistant. Decide if each suspect candidate is a duplicate of the target.`,
    ``,
    targetBlock,
    ``,
    `Suspects:`,
    suspectsBlock,
    ``,
    `For each suspect, output one JSON object per line (no array brackets) with keys:`,
    `  id (string), confidence ("high"|"medium"|"none"), reason (short string, max 10 words)`,
    `Only include suspects with confidence "high" or "medium". Omit "none" matches entirely.`,
    `Output raw JSON lines only — no prose, no markdown.`,
  ].join("\n");

  try {
    const model = getModel(aiConfig);
    const { text } = await generateText({ model, prompt, maxOutputTokens: 512 });

    const matches: DuplicateMatch[] = [];
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("{")) continue;
      try {
        const parsed = JSON.parse(trimmed) as {
          id: string;
          confidence: "high" | "medium" | "none";
          reason: string;
        };
        if (parsed.confidence === "none") continue;
        const suspect = suspects.find((s) => s.id === parsed.id);
        if (!suspect) continue;
        matches.push({
          candidateId: suspect.id,
          confidence: parsed.confidence,
          reason: parsed.reason ?? "",
          fullName: `${suspect.firstName} ${suspect.lastName}`,
          email: suspect.email,
        });
      } catch {
        // skip malformed line
      }
    }

    return { ok: true, matches };
  } catch (error) {
    console.error("Duplicate detection AI call failed", error);
    return { ok: false, error: "AI duplicate detection failed. Try again later." };
  }
}
