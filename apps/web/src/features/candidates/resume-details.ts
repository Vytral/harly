import "server-only";

import type { ResumeEducationItem, ResumeExperienceItem } from "@harly/db";
import { getWorkspaceAiConfig } from "@/lib/ai/config";
import { parseResumeStructured } from "@/lib/ai/surfaces/parse-resume";
import { extractResumeAutofillFields } from "@/features/applications/resume-autofill";
import { extractResumeText } from "@/lib/resume/extract-text";
import { resumeKeyFromUrl } from "@/lib/resume/storage-key";
import { isWorkspaceStorageKey, maxResumeFileSize } from "@/lib/storage-validation";
import { storage } from "@/lib/storage";

export type ParsedResumeDetails = {
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

export async function parseCandidateFileDetails(input: {
  workspaceId: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  /** The candidate's name, so the AI profile can strip it when anonymization is on. */
  identity: { firstName: string | null; lastName: string | null };
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

    const { text, diagnostics } = await extractResumeText({
      buffer,
      fileName: input.fileName,
      mimeType: input.fileType,
    });
    if (diagnostics.length > 0) {
      console.warn("Resume extraction notes", { fileName: input.fileName, diagnostics });
    }
    if (!text.trim()) return empty;

    // Prefer the AI structured parse (summary + skills + experience timeline +
    // education) when the workspace has AI configured; fall back to the heuristic
    // so uploads never break if AI is off or errors.
    const aiConfig = await getWorkspaceAiConfig(input.workspaceId);
    if (aiConfig) {
      try {
        const fullName = [input.identity.firstName, input.identity.lastName]
          .filter(Boolean)
          .join(" ");
        const structured = await parseResumeStructured(aiConfig, text, {
          workspaceId: input.workspaceId,
          identity: {
            firstName: input.identity.firstName,
            lastName: input.identity.lastName,
            fullName: fullName || null,
          },
        });
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

/** True when the parse produced anything worth stamping `parsed_at` for. */
export function hasParsedResumeDetails(details: ParsedResumeDetails): boolean {
  return Boolean(
    details.summary ||
      details.skills.length > 0 ||
      details.education ||
      details.experienceYears !== null ||
      details.experience.length > 0 ||
      details.educationItems.length > 0,
  );
}

