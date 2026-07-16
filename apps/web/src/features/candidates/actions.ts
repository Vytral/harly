"use server";

import { createElement } from "react";
import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@harly/db";
import {
  activityEvents,
  applications,
  candidates,
  candidateFiles,
  candidateNotes,
  candidateTags,
  jobStages,
  jobs,
  member as authMembers,
  notifications,
  scorecards,
} from "@harly/db";
import type { ResumeEducationItem, ResumeExperienceItem } from "@harly/db";
import { getWorkspaceAiConfig } from "@/lib/ai/config";
import { parseResumeStructured } from "@/lib/ai/surfaces/parse-resume";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { logAuditEvent } from "@/lib/audit-log";
import { getWorkspaceEmailSender } from "@/lib/email";
import { getInboundReplyTo } from "@/lib/email/inbound-token";
import { insertCanonicalMessage } from "@/lib/mail/canonical";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { updateApplicationStatus } from "@/features/pipeline/actions";
import {
  permanentlyDeleteCandidate,
  restoreCandidate,
  trashCandidate,
  trashCandidates,
} from "./data";
import {
  allowedResumeContentTypes,
  maxResumeFileSize,
} from "@/lib/storage-validation";
import { extractResumeAutofillFields } from "@/features/applications/resume-autofill";
import { extractResumeText } from "@/lib/resume/extract-text";
import { resumeKeyFromUrl } from "@/lib/resume/storage-key";
import { isWorkspaceStorageKey } from "@/lib/storage-validation";
import { storage } from "@/lib/storage";
import { createLogger } from "@/lib/logger";

export type CandidateActionState = {
  success: boolean;
  error?: string;
};

const bulkStatusSchema = z.object({
  applicationIds: z.array(z.string().min(1)).min(1).max(200),
  status: z.enum(["active", "hired", "rejected", "withdrawn"]),
});

const emailLog = createLogger("candidate-email");

/** Apply a status to many applications at once from the candidates list. */
export async function bulkUpdateCandidateStatusAction(input: {
  applicationIds: string[];
  status: "active" | "hired" | "rejected" | "withdrawn";
}): Promise<{ success: boolean; error?: string }> {
  const parsed = bulkStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid selection." };
  }

  await requirePermission("candidates:edit");

  const { organization: workspace } = await getWorkspaceContext();
  const result = await updateApplicationStatus({
    workspaceId: workspace.id,
    applicationIds: parsed.data.applicationIds,
    status: parsed.data.status,
  });

  if (result.success) {
    revalidatePath("/dashboard/candidates");
    revalidatePath("/dashboard/pipeline");
  }

  return result;
}

const mentionSchema = z.object({
  userId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
});

const candidateNoteSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Note body is required.")
    .max(5000, "Notes must be 5000 characters or fewer."),
  mentions: z.array(mentionSchema).max(20).default([]),
});

export type NoteMention = z.infer<typeof mentionSchema>;

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null));

const optionalHttpsUrl = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null))
  .refine((value) => !value || URL.canParse(value), "Enter a valid URL.")
  .refine((value) => !value || value.startsWith("https://"), {
    message: "URL must start with https://",
  });

const candidateUpdateSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  email: z.string().trim().email("Enter a valid email address."),
  phone: optionalText,
  address: optionalText,
  linkedinUrl: optionalHttpsUrl,
  githubUrl: optionalHttpsUrl,
  websiteUrl: optionalHttpsUrl,
  headline: optionalText,
  summary: optionalText,
});

const candidateFileSchema = z.object({
  fileName: z.string().trim().min(1, "Filename is required.").max(255),
  fileUrl: z.string().trim().min(1, "File URL is required."),
  fileType: z.enum(allowedResumeContentTypes),
  fileSize: z.coerce
    .number()
    .int()
    .positive("File is required.")
    .max(maxResumeFileSize, "File must be 10MB or smaller."),
  contentHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, "Invalid file hash.")
    .optional(),
});

type ParsedResumeDetails = {
  summary: string | null;
  skills: string[];
  education: string | null;
  experienceYears: number | null;
  experience: ResumeExperienceItem[];
  educationItems: ResumeEducationItem[];
};

/** Compact one-line education label from a structured entry (for back-compat). */
function educationLabel(item: ResumeEducationItem): string | null {
  const parts = [item.degree, item.field, item.school].filter(
    (value): value is string => Boolean(value),
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

function summarizeResumeText(text: string) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length >= 80);

  const summary = paragraphs.find(
    (paragraph) =>
      !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(paragraph) &&
      !/^\+?\d[\d\s().-]{7,}\d$/.test(paragraph),
  );

  if (!summary) return null;
  return summary.length > 420 ? `${summary.slice(0, 417).trim()}…` : summary;
}

async function parseCandidateFileDetails(input: {
  workspaceId: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}): Promise<ParsedResumeDetails> {
  const empty = {
    summary: null,
    skills: [],
    education: null,
    experienceYears: null,
    experience: [],
    educationItems: [],
  } satisfies ParsedResumeDetails;

  const key = resumeKeyFromUrl(input.fileUrl);
  if (
    !key ||
    !isWorkspaceStorageKey(input.workspaceId, key, "resumes") ||
    input.fileSize > maxResumeFileSize
  ) {
    return empty;
  }

  try {
    const buffer = await storage.read(key);
    if (buffer.byteLength === 0 || buffer.byteLength > maxResumeFileSize) {
      return empty;
    }

    const { text } = await extractResumeText({
      buffer,
      fileName: input.fileName,
      mimeType: input.fileType,
    });
    if (!text.trim()) return empty;

    // Prefer the AI structured parse (summary + skills + experience timeline +
    // education) when the workspace has AI configured; fall back to the heuristic
    // so uploads never break if AI is off or errors.
    const aiConfig = await getWorkspaceAiConfig(input.workspaceId);
    if (aiConfig) {
      try {
        const structured = await parseResumeStructured(aiConfig, text);
        return {
          summary: structured.summary ?? summarizeResumeText(text),
          skills: structured.skills,
          education: structured.education[0]
            ? educationLabel(structured.education[0])
            : null,
          experienceYears: structured.experienceYears,
          experience: structured.experience,
          educationItems: structured.education,
        };
      } catch (error) {
        console.error("AI resume parse failed; using heuristic", error);
      }
    }

    const fields = extractResumeAutofillFields({
      fileName: input.fileName,
      text,
    });

    return {
      summary: summarizeResumeText(text),
      skills: fields.skills ?? [],
      education: fields.education ?? null,
      experienceYears: fields.experienceYears ?? null,
      experience: [],
      educationItems: [],
    };
  } catch (error) {
    console.error("Failed to parse candidate resume details", error);
    return empty;
  }
}

export async function createCandidateNote(input: {
  candidateId: string;
  workspaceId: string;
  body: string;
  mentions?: NoteMention[];
}): Promise<{
  success: boolean;
  error?: string;
  note?: {
    id: string;
    body: string;
    createdAt: string;
    authorName: string;
    authorEmail: string;
    mentions: NoteMention[];
  };
}> {
  try {
    const parsed = candidateNoteSchema.safeParse({
      body: input.body,
      mentions: input.mentions ?? [],
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid note.",
      };
    }

    const { organization: workspace, user } = await getWorkspaceContext();

    if (workspace.id !== input.workspaceId) {
      return {
        success: false,
        error: "Workspace access denied.",
      };
    }

    await requirePermission("collab:write");

    // Only keep mentions that resolve to real members of this workspace.
    const memberRows = await db
      .select({ userId: authMembers.userId })
      .from(authMembers)
      .where(eq(authMembers.organizationId, workspace.id));
    const memberIds = new Set(memberRows.map((m) => m.userId));
    const seen = new Set<string>();
    const mentions = parsed.data.mentions.filter((m) => {
      if (!memberIds.has(m.userId) || seen.has(m.userId)) return false;
      seen.add(m.userId);
      return true;
    });

    const result = await db.transaction(async (tx) => {
      const [candidate] = await tx
        .select({
          id: candidates.id,
          firstName: candidates.firstName,
          lastName: candidates.lastName,
        })
        .from(candidates)
        .where(
          and(
            eq(candidates.id, input.candidateId),
            eq(candidates.workspaceId, input.workspaceId),
          ),
        )
        .limit(1);

      if (!candidate) {
        return { success: false, error: "Candidate not found" };
      }

      const [note] = await tx
        .insert(candidateNotes)
        .values({
          workspaceId: input.workspaceId,
          candidateId: input.candidateId,
          authorId: user.id,
          body: parsed.data.body,
          mentions,
        })
        .returning({
          id: candidateNotes.id,
          body: candidateNotes.body,
          createdAt: candidateNotes.createdAt,
        });

      if (!note) {
        throw new Error("Note could not be created.");
      }

      await tx.insert(activityEvents).values({
        workspaceId: input.workspaceId,
        actorId: user.id,
        entityType: "candidate",
        entityId: input.candidateId,
        type: "note.added",
        metadata: {
          preview: parsed.data.body.slice(0, 100),
        },
      });

      // One "mentioned you" event per teammate — skips self-mentions.
      const notifiable = mentions.filter((m) => m.userId !== user.id);
      if (notifiable.length > 0) {
        await tx.insert(activityEvents).values(
          notifiable.map((m) => ({
            workspaceId: input.workspaceId,
            actorId: user.id,
            entityType: "candidate" as const,
            entityId: input.candidateId,
            type: "note.mentioned",
            metadata: {
              noteId: note.id,
              mentionedUserId: m.userId,
              mentionedName: m.name,
              preview: parsed.data.body.slice(0, 100),
            },
          })),
        );

        // Inbox delivery — one notification per mentioned teammate.
        await tx.insert(notifications).values(
          notifiable.map((m) => ({
            workspaceId: input.workspaceId,
            userId: m.userId,
            actorId: user.id,
            type: "note.mentioned",
            title: `${user.name} mentioned you on ${candidate.firstName} ${candidate.lastName}`,
            body: parsed.data.body.slice(0, 200),
            href: `/dashboard/candidates/${input.candidateId}`,
            metadata: { noteId: note.id },
          })),
        );
      }

      return {
        success: true,
        note: {
          id: note.id,
          body: note.body,
          createdAt: note.createdAt.toISOString(),
          authorName: user.name,
          authorEmail: user.email,
          mentions,
        },
      };
    });

    if (result.success) {
      revalidatePath(`/dashboard/candidates/${input.candidateId}`);
    }

    return result;
  } catch (error) {
    const message =
      "Unable to create note.";

    console.error("Failed to create candidate note", error);

    return {
      success: false,
      error: message,
    };
  }
}

export async function updateCandidateProfile(input: {
  candidateId: string;
  workspaceId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  linkedinUrl: string;
  githubUrl: string;
  websiteUrl: string;
  headline: string;
  summary: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = candidateUpdateSchema.safeParse(input);

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid candidate profile.",
      };
    }

    const { organization: workspace, user } = await getWorkspaceContext();

    if (workspace.id !== input.workspaceId) {
      return { success: false, error: "Workspace access denied." };
    }

    await requirePermission("candidates:edit");

    const [candidate] = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(candidates)
        .set({
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          email: parsed.data.email.toLowerCase(),
          phone: parsed.data.phone,
          address: parsed.data.address,
          linkedinUrl: parsed.data.linkedinUrl,
          githubUrl: parsed.data.githubUrl,
          websiteUrl: parsed.data.websiteUrl,
          headline: parsed.data.headline,
          summary: parsed.data.summary,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(candidates.id, input.candidateId),
            eq(candidates.workspaceId, input.workspaceId),
          ),
        )
        .returning({ id: candidates.id });

      if (!row) return [undefined];

      await tx.insert(activityEvents).values({
        workspaceId: input.workspaceId,
        actorId: user.id,
        entityType: "candidate",
        entityId: input.candidateId,
        type: "candidate.updated",
        metadata: {
          candidateName: `${parsed.data.firstName} ${parsed.data.lastName}`,
        },
      });

      return [row];
    });

    if (!candidate) {
      return { success: false, error: "Candidate not found." };
    }

    revalidatePath(`/dashboard/candidates/${input.candidateId}`);
    revalidatePath("/dashboard/candidates");

    return { success: true };
  } catch (error) {
    const message =
      "Unable to update candidate.";

    console.error("Failed to update candidate profile", error);

    return { success: false, error: message };
  }
}

export async function updateCandidateAvatarAction(input: {
  candidateId: string;
  workspaceId: string;
  avatarUrl: string | null;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { organization: workspace } = await getWorkspaceContext();
    if (workspace.id !== input.workspaceId) {
      return { success: false, error: "Workspace access denied." };
    }

    await requirePermission("candidates:edit");

    const [candidate] = await db
      .update(candidates)
      .set({
        avatarUrl: input.avatarUrl,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(candidates.id, input.candidateId),
          eq(candidates.workspaceId, input.workspaceId),
        ),
      )
      .returning({ id: candidates.id });

    if (!candidate) {
      return { success: false, error: "Candidate not found." };
    }

    revalidatePath(`/dashboard/candidates/${input.candidateId}`);
    return { success: true };
  } catch (error) {
    console.error("Failed to update candidate avatar", error);
    return { success: false, error: "Unable to update avatar." };
  }
}

export async function attachCandidateFile(input: {
  candidateId: string;
  workspaceId: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  contentHash?: string;
}): Promise<{
  success: boolean;
  error?: string;
  file?: {
    id: string;
    fileName: string;
    fileUrl: string;
    fileType: string | null;
    fileSize: number | null;
    contentHash: string | null;
    parsedSummary: string | null;
    parsedSkills: string[];
    parsedEducation: string | null;
    parsedExperienceYears: number | null;
    parsedAt: string | null;
    createdAt: string;
    uploadedByName: string;
  };
}> {
  try {
    const parsed = candidateFileSchema.safeParse(input);

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid file.",
      };
    }

    const { organization: workspace, user } = await getWorkspaceContext();

    if (workspace.id !== input.workspaceId) {
      return { success: false, error: "Workspace access denied." };
    }

    await requirePermission("candidates:edit");

    const key = resumeKeyFromUrl(parsed.data.fileUrl);
    if (!key || !isWorkspaceStorageKey(workspace.id, key, "resumes")) {
      return { success: false, error: "File upload is invalid." };
    }

    const parsedDetails = await parseCandidateFileDetails({
      workspaceId: input.workspaceId,
      fileUrl: parsed.data.fileUrl,
      fileName: parsed.data.fileName,
      fileType: parsed.data.fileType,
      fileSize: parsed.data.fileSize,
    });
    const parsedAt =
      parsedDetails.summary ||
      parsedDetails.skills.length > 0 ||
      parsedDetails.education ||
      parsedDetails.experienceYears !== null ||
      parsedDetails.experience.length > 0 ||
      parsedDetails.educationItems.length > 0
        ? new Date()
        : null;

    const result = await db.transaction(async (tx) => {
      const [candidate] = await tx
        .select({ id: candidates.id })
        .from(candidates)
        .where(
          and(
            eq(candidates.id, input.candidateId),
            eq(candidates.workspaceId, input.workspaceId),
          ),
        )
        .limit(1);

      if (!candidate) {
        return { success: false, error: "Candidate not found." };
      }

      if (parsed.data.contentHash) {
        const [existing] = await tx
          .select({
            id: candidateFiles.id,
            fileName: candidateFiles.fileName,
            fileUrl: candidateFiles.fileUrl,
            fileType: candidateFiles.fileType,
            fileSize: candidateFiles.fileSize,
            contentHash: candidateFiles.contentHash,
            parsedSummary: candidateFiles.parsedSummary,
            parsedSkills: candidateFiles.parsedSkills,
            parsedEducation: candidateFiles.parsedEducation,
            parsedExperienceYears: candidateFiles.parsedExperienceYears,
            parsedAt: candidateFiles.parsedAt,
            createdAt: candidateFiles.createdAt,
          })
          .from(candidateFiles)
          .where(
            and(
              eq(candidateFiles.workspaceId, input.workspaceId),
              eq(candidateFiles.candidateId, input.candidateId),
              eq(candidateFiles.contentHash, parsed.data.contentHash.toLowerCase()),
            ),
          )
          .orderBy(desc(candidateFiles.createdAt))
          .limit(1);

        if (existing) {
          return {
            success: true,
            file: {
              ...existing,
              parsedSkills: Array.isArray(existing.parsedSkills)
                ? existing.parsedSkills
                : [],
              parsedAt: existing.parsedAt?.toISOString() ?? null,
              createdAt: existing.createdAt.toISOString(),
              uploadedByName: user.name,
            },
          };
        }
      }

      const [file] = await tx
        .insert(candidateFiles)
        .values({
          workspaceId: input.workspaceId,
          candidateId: input.candidateId,
          fileName: parsed.data.fileName,
          fileUrl: parsed.data.fileUrl,
          fileType: parsed.data.fileType,
          fileSize: parsed.data.fileSize,
          contentHash: parsed.data.contentHash?.toLowerCase() ?? null,
          parsedSummary: parsedDetails.summary,
          parsedSkills: parsedDetails.skills,
          parsedEducation: parsedDetails.education,
          parsedExperienceYears: parsedDetails.experienceYears,
          parsedExperience: parsedDetails.experience,
          parsedEducationItems: parsedDetails.educationItems,
          parsedAt,
          uploadedById: user.id,
        })
        .returning({
          id: candidateFiles.id,
          fileName: candidateFiles.fileName,
          fileUrl: candidateFiles.fileUrl,
          fileType: candidateFiles.fileType,
          fileSize: candidateFiles.fileSize,
          contentHash: candidateFiles.contentHash,
          parsedSummary: candidateFiles.parsedSummary,
          parsedSkills: candidateFiles.parsedSkills,
          parsedEducation: candidateFiles.parsedEducation,
          parsedExperienceYears: candidateFiles.parsedExperienceYears,
          parsedAt: candidateFiles.parsedAt,
          createdAt: candidateFiles.createdAt,
        });

      if (!file) {
        throw new Error("File could not be saved.");
      }

      await tx.insert(activityEvents).values({
        workspaceId: input.workspaceId,
        actorId: user.id,
        entityType: "candidate",
        entityId: input.candidateId,
        type: "file.uploaded",
        metadata: {
          fileName: parsed.data.fileName,
          fileUrl: parsed.data.fileUrl,
        },
      });

      return {
        success: true,
        file: {
          ...file,
          parsedSkills: Array.isArray(file.parsedSkills) ? file.parsedSkills : [],
          parsedAt: file.parsedAt?.toISOString() ?? null,
          createdAt: file.createdAt.toISOString(),
          uploadedByName: user.name,
        },
      };
    });

    if (result.success) {
      revalidatePath(`/dashboard/candidates/${input.candidateId}`);
    }

    return result;
  } catch (error) {
    const message =
      "Unable to upload file.";

    console.error("Failed to attach candidate file", error);

    return { success: false, error: message };
  }
}

async function assertCandidate(candidateId: string, workspaceId: string) {
  const [candidate] = await db
    .select({ id: candidates.id })
    .from(candidates)
    .where(and(eq(candidates.id, candidateId), eq(candidates.workspaceId, workspaceId)))
    .limit(1);
  return Boolean(candidate);
}

// ── Scorecards (structured evaluations) ──
const scorecardSchema = z.object({
  candidateId: z.string().min(1),
  workspaceId: z.string().min(1),
  rating: z.enum(["strong", "mixed", "weak"]),
  comment: z.string().max(5000).optional(),
  stageName: z.string().max(200).nullish(),
});

export async function createScorecard(input: {
  candidateId: string;
  workspaceId: string;
  rating: "strong" | "mixed" | "weak";
  comment?: string;
  stageName?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = scorecardSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid evaluation." };
    }
    const { organization: workspace, user } = await getWorkspaceContext();
    if (workspace.id !== input.workspaceId) {
      return { success: false, error: "Workspace access denied." };
    }
    await requirePermission("collab:write");
    if (!(await assertCandidate(input.candidateId, input.workspaceId))) {
      return { success: false, error: "Candidate not found." };
    }
    await db.insert(scorecards).values({
      workspaceId: input.workspaceId,
      candidateId: input.candidateId,
      authorId: user.id,
      rating: parsed.data.rating,
      comment: parsed.data.comment?.trim() || null,
      stageName: parsed.data.stageName ?? null,
    });
    revalidatePath(`/dashboard/candidates/${input.candidateId}`);
    return { success: true };
  } catch {
    return {
      success: false,
      error: "Unable to save evaluation.",
    };
  }
}

// ── Candidate tags ──
const tagSchema = z.object({
  candidateId: z.string().min(1),
  workspaceId: z.string().min(1),
  label: z.string().trim().min(1).max(40),
});

export async function addCandidateTag(input: {
  candidateId: string;
  workspaceId: string;
  label: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = tagSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid tag." };
    }
    const { organization: workspace, user } = await getWorkspaceContext();
    if (workspace.id !== input.workspaceId) {
      return { success: false, error: "Workspace access denied." };
    }
    await requirePermission("candidates:edit");
    if (!(await assertCandidate(input.candidateId, input.workspaceId))) {
      return { success: false, error: "Candidate not found." };
    }
    await db
      .insert(candidateTags)
      .values({
        workspaceId: input.workspaceId,
        candidateId: input.candidateId,
        label: parsed.data.label,
        createdById: user.id,
      })
      .onConflictDoNothing();
    revalidatePath(`/dashboard/candidates/${input.candidateId}`);
    return { success: true };
  } catch {
    return {
      success: false,
      error: "Unable to add tag.",
    };
  }
}

export async function removeCandidateTag(input: {
  tagId: string;
  candidateId: string;
  workspaceId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { organization: workspace } = await getWorkspaceContext();
    if (workspace.id !== input.workspaceId) {
      return { success: false, error: "Workspace access denied." };
    }
    await requirePermission("candidates:edit");
    await db
      .delete(candidateTags)
      .where(and(eq(candidateTags.id, input.tagId), eq(candidateTags.workspaceId, input.workspaceId)));
    revalidatePath(`/dashboard/candidates/${input.candidateId}`);
    return { success: true };
  } catch {
    return {
      success: false,
      error: "Unable to remove tag.",
    };
  }
}

// ── Candidate messages (email via Resend) ──
const messageSchema = z.object({
  candidateId: z.string().min(1),
  workspaceId: z.string().min(1),
  toEmail: z.string().email(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20000),
});

const bulkEmailSchema = z.object({
  candidateIds: z.array(z.uuid()).min(1).max(50),
  subject: z.string().trim().min(1, "Subject is required.").max(300),
  body: z.string().trim().min(1, "Message body is required.").max(10_000),
});

/**
 * Send a (template-interpolated) email to up to 50 candidates. Subject/body
 * may contain {{variables}}; they are filled per candidate server-side.
 * Sequential sends — Resend rate limits — each recorded in candidate_messages.
 */
export async function sendBulkCandidateEmail(input: {
  candidateIds: string[];
  subject: string;
  body: string;
}): Promise<{ success: boolean; error?: string; sent: number; failed: number }> {
  const parsed = bulkEmailSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid bulk email.",
      sent: 0,
      failed: 0,
    };
  }

  await requirePermission("collab:write");

  const { interpolateTemplate } = await import(
    "@/features/email-templates/interpolate"
  );
  const { organization: workspace, user } = await getWorkspaceContext();

  // Workspace-scoped fetch — ids from the client are never trusted directly.
  const rows = await db
    .select({
      id: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      email: candidates.email,
    })
    .from(candidates)
    .where(
      and(
        eq(candidates.workspaceId, workspace.id),
        inArray(candidates.id, parsed.data.candidateIds),
      ),
    );

  if (rows.length === 0) {
    return { success: false, error: "No matching candidates.", sent: 0, failed: 0 };
  }

  // Latest application per candidate — job title for {{job_title}}, and the
  // application id for inbound reply routing.
  const jobTitleRows = await db
    .select({
      applicationId: applications.id,
      candidateId: applications.candidateId,
      jobTitle: jobs.title,
      appliedAt: applications.appliedAt,
    })
    .from(applications)
    .innerJoin(
      jobs,
      and(eq(jobs.workspaceId, workspace.id), eq(jobs.id, applications.jobId)),
    )
    .where(
      and(
        eq(applications.workspaceId, workspace.id),
        inArray(applications.candidateId, rows.map((r) => r.id)),
      ),
    )
    .orderBy(desc(applications.appliedAt));
  const jobTitleByCandidate = new Map<string, string>();
  const latestApplicationByCandidate = new Map<string, string>();
  for (const row of jobTitleRows) {
    if (!jobTitleByCandidate.has(row.candidateId)) {
      jobTitleByCandidate.set(row.candidateId, row.jobTitle);
      latestApplicationByCandidate.set(row.candidateId, row.applicationId);
    }
  }

  const sender = await getWorkspaceEmailSender(workspace.id);
  if (!sender) {
    return {
      success: false,
      error: "Email sending is not configured. Go to Settings → Email to set up your sender.",
      sent: 0,
      failed: 0,
    };
  }
  let sent = 0;
  let failed = 0;

  for (const candidate of rows) {
    const values = {
      candidate_first_name: candidate.firstName,
      candidate_last_name: candidate.lastName,
      candidate_full_name: `${candidate.firstName} ${candidate.lastName}`,
      job_title: jobTitleByCandidate.get(candidate.id) ?? "",
      company_name: workspace.name,
      sender_name: user.name,
    };
    const subject = interpolateTemplate(parsed.data.subject, values);
    const body = interpolateTemplate(parsed.data.body, values);
    const applicationId = latestApplicationByCandidate.get(candidate.id);
    const replyTo = applicationId
      ? await getInboundReplyTo(workspace.id, applicationId)
      : undefined;
    const messageId = `<${randomUUID()}@harly.local>`;

    let status: "sent" | "queued" | "failed" = sender ? "sent" : "queued";
    if (sender) {
      try {
        await sender.send({
          to: candidate.email,
          subject,
          replyTo,
          messageId,
          react: createElement(
            "div",
            { style: { whiteSpace: "pre-wrap", fontFamily: "sans-serif" } },
            body,
          ),
        });
      } catch (sendError) {
        emailLog.error(
          { err: sendError, workspaceId: workspace.id, candidateId: candidate.id },
          "bulk candidate email provider rejected message",
        );
        status = "failed";
      }
    }

    await insertCanonicalMessage({
      workspaceId: workspace.id,
      source: "provider",
      candidateId: candidate.id,
      applicationId: applicationId ?? null,
      participantEmail: candidate.email,
      subject,
      receivedAt: new Date(),
      messageId,
      direction: "outbound",
      fromEmail: process.env.EMAIL_FROM ?? "noreply@harly.local",
      toEmails: [candidate.email],
      textBody: body,
    });

    if (status === "failed") failed += 1;
    else sent += 1;
  }

  revalidatePath("/dashboard/candidates");
  return { success: true, sent, failed };
}

// ── AI email draft ──────────────────────────────────────────────────────────

const draftEmailSchema = z.object({
  candidateId: z.string().min(1),
  type: z.enum(["screening", "interview_invite", "rejection", "offer", "followup"]),
});

export type GenerateEmailDraftResult =
  | { ok: true; subject: string; body: string }
  | { ok: false; error: string; reason?: "not_configured" };

export async function generateEmailDraftAction(input: {
  candidateId: string;
  type: "screening" | "interview_invite" | "rejection" | "offer" | "followup";
}): Promise<GenerateEmailDraftResult> {
  const parsed = draftEmailSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid input." };
  }

  await requirePermission("collab:write");
  const { organization: workspace, user } = await getWorkspaceContext();

  const { getWorkspaceAiConfig } = await import("@/lib/ai/config");
  const config = await getWorkspaceAiConfig(workspace.id);
  if (!config) {
    return {
      ok: false,
      error: "Enable AI in Settings to draft with AI.",
      reason: "not_configured",
    };
  }

  // Load candidate + their most recent application context.
  const [row] = await db
    .select({
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      jobTitle: jobs.title,
      stageName: jobStages.name,
    })
    .from(candidates)
    .leftJoin(
      applications,
      and(
        eq(applications.workspaceId, workspace.id),
        eq(applications.candidateId, candidates.id),
      ),
    )
    .leftJoin(
      jobs,
      and(eq(jobs.workspaceId, workspace.id), eq(jobs.id, applications.jobId)),
    )
    .leftJoin(jobStages, eq(jobStages.id, applications.currentStageId))
    .where(
      and(
        eq(candidates.workspaceId, workspace.id),
        eq(candidates.id, parsed.data.candidateId),
      ),
    )
    .orderBy(desc(applications.appliedAt))
    .limit(1);

  if (!row) {
    return { ok: false, error: "Candidate not found." };
  }

  // Also grab latest AI evaluation for context.
  const { aiEvaluations } = await import("@harly/db");
  const [evalRow] = await db
    .select({ score: aiEvaluations.score, recommendation: aiEvaluations.recommendation })
    .from(aiEvaluations)
    .where(
      and(
        eq(aiEvaluations.workspaceId, workspace.id),
        eq(aiEvaluations.candidateId, parsed.data.candidateId),
      ),
    )
    .orderBy(desc(aiEvaluations.updatedAt))
    .limit(1);

  try {
    const { draftEmailWithAI } = await import("@/lib/ai/surfaces/draft-email");
    const draft = await draftEmailWithAI(config, {
      type: parsed.data.type,
      candidateName: `${row.firstName} ${row.lastName}`,
      jobTitle: row.jobTitle ?? "the role",
      companyName: workspace.name,
      senderName: user.name,
      aiScore: evalRow?.score ?? null,
      aiRecommendation: evalRow?.recommendation ?? null,
    });
    return { ok: true, subject: draft.subject, body: draft.body };
  } catch (error) {
    console.error("Email draft AI failed", error);
    return { ok: false, error: "Draft generation failed. Check your AI settings." };
  }
}

export async function sendCandidateMessage(input: {
  candidateId: string;
  workspaceId: string;
  toEmail: string;
  subject: string;
  body: string;
}): Promise<{ success: boolean; error?: string; delivered?: boolean }> {
  try {
    const parsed = messageSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid message." };
    }
    const { organization: workspace } = await getWorkspaceContext();
    if (workspace.id !== input.workspaceId) {
      return { success: false, error: "Workspace access denied." };
    }
    await requirePermission("collab:write");
    if (!(await assertCandidate(input.candidateId, input.workspaceId))) {
      return { success: false, error: "Candidate not found." };
    }

    // Latest application for this candidate — used to route inbound replies
    // back to the right thread via a Reply-To token, when inbound is on.
    const [latestApplication] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(
        and(
          eq(applications.workspaceId, input.workspaceId),
          eq(applications.candidateId, input.candidateId),
        ),
      )
      .orderBy(desc(applications.appliedAt))
      .limit(1);
    const replyTo = latestApplication
      ? await getInboundReplyTo(workspace.id, latestApplication.id)
      : undefined;
    const messageId = `<${randomUUID()}@harly.local>`;

    // Send via the workspace's configured provider (or platform default);
    // otherwise persist as queued.
    const sender = await getWorkspaceEmailSender(workspace.id);
    let status: "sent" | "queued" | "failed" = sender ? "sent" : "queued";
    if (sender) {
      try {
        await sender.send({
          to: parsed.data.toEmail,
          subject: parsed.data.subject,
          replyTo,
          messageId,
          react: createElement(
            "div",
            { style: { whiteSpace: "pre-wrap", fontFamily: "sans-serif" } },
            parsed.data.body,
          ),
        });
      } catch (sendError) {
        emailLog.error(
          { err: sendError, workspaceId: workspace.id, candidateId: input.candidateId },
          "candidate email provider rejected message",
        );
        status = "failed";
      }
    }

    await insertCanonicalMessage({
      workspaceId: input.workspaceId,
      source: "provider",
      candidateId: input.candidateId,
      applicationId: latestApplication?.id ?? null,
      participantEmail: parsed.data.toEmail,
      subject: parsed.data.subject,
      receivedAt: new Date(),
      messageId,
      direction: "outbound",
      fromEmail: process.env.EMAIL_FROM ?? "noreply@harly.local",
      toEmails: [parsed.data.toEmail],
      textBody: parsed.data.body,
    });
    revalidatePath(`/dashboard/candidates/${input.candidateId}`);

    if (status === "failed") {
      return { success: false, error: "Email failed to send.", delivered: false };
    }
    return { success: true, delivered: status === "sent" };
  } catch (error) {
    emailLog.error(error, "candidate email action failed before delivery completed");
    return {
      success: false,
      error: "Unable to send message.",
    };
  }
}

// ── Candidate trash (soft delete) ──

const candidateIdsSchema = z.array(z.string().min(1)).min(1).max(200);

/** Move a candidate to the trash — reversible. */
export async function trashCandidateAction(
  candidateId: string,
): Promise<CandidateActionState> {
  await requirePermission("candidates:delete");
  const result = await trashCandidate(candidateId);

  if (!result.ok) {
    return { success: false, error: result.error };
  }

  const { organization, user } = await getWorkspaceContext();
  await logAuditEvent({
    workspaceId: organization.id,
    actorId: user.id,
    actorEmail: user.email,
    action: "candidate.trashed",
    resourceType: "candidate",
    resourceId: candidateId,
    severity: "warning",
  });

  revalidatePath("/dashboard/candidates");
  revalidatePath(`/dashboard/candidates/${candidateId}`);
  revalidatePath("/dashboard/pipeline");
  revalidatePath("/dashboard");
  return { success: true };
}

/** Move multiple candidates to the trash — reversible. */
export async function bulkTrashCandidatesAction(
  candidateIds: string[],
): Promise<CandidateActionState & { count?: number }> {
  const parsed = candidateIdsSchema.safeParse(candidateIds);
  if (!parsed.success) {
    return { success: false, error: "Invalid selection." };
  }

  await requirePermission("candidates:delete");
  const result = await trashCandidates(parsed.data);

  revalidatePath("/dashboard/candidates");
  revalidatePath("/dashboard/pipeline");
  revalidatePath("/dashboard");
  return { success: true, count: result.count };
}

/** Restore a candidate out of the trash. */
export async function restoreCandidateAction(
  candidateId: string,
): Promise<CandidateActionState> {
  await requirePermission("candidates:delete");
  const result = await restoreCandidate(candidateId);

  if (!result.ok) {
    return { success: false, error: result.error };
  }

  revalidatePath("/dashboard/candidates");
  revalidatePath(`/dashboard/candidates/${candidateId}`);
  revalidatePath("/dashboard/pipeline");
  revalidatePath("/dashboard");
  return { success: true };
}

/** Permanently delete a trashed candidate and all related records. */
export async function permanentlyDeleteCandidateAction(
  candidateId: string,
): Promise<CandidateActionState> {
  await requirePermission("candidates:delete");
  const result = await permanentlyDeleteCandidate(candidateId);

  if (!result.ok) {
    return { success: false, error: result.error };
  }

  const { organization, user } = await getWorkspaceContext();
  await logAuditEvent({
    workspaceId: organization.id,
    actorId: user.id,
    actorEmail: user.email,
    action: "candidate.deleted",
    resourceType: "candidate",
    resourceId: candidateId,
    severity: "critical",
  });

  revalidatePath("/dashboard/candidates");
  revalidatePath("/dashboard/pipeline");
  revalidatePath("/dashboard");
  return { success: true };
}

// ── AI scorecard assists ──

export type RefineScorecardResult =
  | { ok: true; refined: string }
  | { ok: false; error: string; reason?: "not_configured" };

const refineScorecardSchema = z.object({
  comment: z.string().trim().min(1, "Write a comment first.").max(6000),
  candidateId: z.string().min(1),
});

/** Improve grammar/clarity/formatting of an interviewer's scorecard comment. */
export async function refineScorecardTextAction(input: {
  comment: string;
  candidateId: string;
}): Promise<RefineScorecardResult> {
  const parsed = refineScorecardSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  await requirePermission("collab:write");
  const { organization: workspace } = await getWorkspaceContext();

  const config = await getWorkspaceAiConfig(workspace.id);
  if (!config) {
    return {
      ok: false,
      error: "Enable AI in Settings to refine with AI.",
      reason: "not_configured",
    };
  }

  const jobTitle = await getLatestJobTitleForCandidate(
    workspace.id,
    parsed.data.candidateId,
  );

  try {
    const { refineScorecardTextWithAI } = await import(
      "@/lib/ai/surfaces/refine-scorecard"
    );
    const result = await refineScorecardTextWithAI(config, {
      comment: parsed.data.comment,
      jobTitle,
    });
    return { ok: true, refined: result.refined };
  } catch (error) {
    console.error("Scorecard refine AI failed", error);
    return { ok: false, error: "Refinement failed. Check your AI settings." };
  }
}

export type ScorecardAttribute = { label: string; whatGoodLooksLike: string };

export type SuggestScorecardAttributesResult =
  | { ok: true; attributes: ScorecardAttribute[] }
  | { ok: false; error: string; reason?: "not_configured" };

const suggestAttributesSchema = z.object({
  candidateId: z.string().min(1),
  existingAttributes: z.array(z.string()).max(20).optional(),
});

/** Suggest role-specific evaluation attributes for a scorecard. */
export async function suggestScorecardAttributesAction(input: {
  candidateId: string;
  existingAttributes?: string[];
}): Promise<SuggestScorecardAttributesResult> {
  const parsed = suggestAttributesSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  await requirePermission("collab:write");
  const { organization: workspace } = await getWorkspaceContext();

  const config = await getWorkspaceAiConfig(workspace.id);
  if (!config) {
    return {
      ok: false,
      error: "Enable AI in Settings to suggest attributes.",
      reason: "not_configured",
    };
  }

  const [job] = await db
    .select({
      title: jobs.title,
      description: jobs.description,
      requirements: jobs.requirements,
    })
    .from(applications)
    .innerJoin(
      jobs,
      and(eq(jobs.workspaceId, workspace.id), eq(jobs.id, applications.jobId)),
    )
    .where(
      and(
        eq(applications.workspaceId, workspace.id),
        eq(applications.candidateId, parsed.data.candidateId),
      ),
    )
    .orderBy(desc(applications.appliedAt))
    .limit(1);

  if (!job) {
    return { ok: false, error: "No job found for this candidate." };
  }

  try {
    const { suggestScorecardAttributesWithAI } = await import(
      "@/lib/ai/surfaces/suggest-scorecard-attributes"
    );
    const attributes = await suggestScorecardAttributesWithAI(config, {
      jobTitle: job.title,
      description: job.description,
      requirements: job.requirements,
      existingAttributes: parsed.data.existingAttributes,
    });
    return { ok: true, attributes };
  } catch (error) {
    console.error("Scorecard attribute AI failed", error);
    return { ok: false, error: "Suggestion failed. Check your AI settings." };
  }
}

/** Latest job title a candidate applied to, or null. Small shared helper. */
async function getLatestJobTitleForCandidate(
  workspaceId: string,
  candidateId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ title: jobs.title })
    .from(applications)
    .innerJoin(
      jobs,
      and(eq(jobs.workspaceId, workspaceId), eq(jobs.id, applications.jobId)),
    )
    .where(
      and(
        eq(applications.workspaceId, workspaceId),
        eq(applications.candidateId, candidateId),
      ),
    )
    .orderBy(desc(applications.appliedAt))
    .limit(1);
  return row?.title ?? null;
}
