"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { db, workspaceSettings } from "@harly/db";
import { createPublicApplication } from "@/features/applications/data";
import { verifyTurnstileToken } from "@/lib/turnstile";
import {
  candidateEducationEntrySchema,
  candidateExperienceEntrySchema,
  createApplicationFormSchema,
  type ApplicationFormValues,
  validateApplicationQuestionAnswers,
} from "@/lib/validations/applications";
import { getPublicJobApplicationContext } from "@/features/applications/data";
import { sendApplicationReceivedEmails } from "@/features/applications/notifications";
import { storage } from "@/lib/storage";
import { extractResumeText } from "@/lib/resume/extract-text";
import { maxResumeFileSize } from "@/lib/storage-validation";
import { getWorkspaceAiConfig } from "@/lib/ai/config";
import { parseResumeWithAI } from "@/lib/ai/surfaces/parse-resume";
import {
  extractResumeAutofillFields,
  type ResumeAutofillFields,
} from "@/features/applications/resume-autofill";
import { scheduleAutoScore } from "@/features/applications/auto-score";

// Rate limiter: IP → {count, resetAt}. Per IP, max 5 parse calls per 60s window.
// Stricter than before to prevent API key drain on public AI parsing.
const _parseRateLimit = new Map<string, { count: number; resetAt: number }>();
const PARSE_LIMIT = 5;
const PARSE_WINDOW_MS = 60_000;

function checkParseRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = _parseRateLimit.get(ip);
  if (!entry || now > entry.resetAt) {
    _parseRateLimit.set(ip, { count: 1, resetAt: now + PARSE_WINDOW_MS });
    return true;
  }
  if (entry.count >= PARSE_LIMIT) return false;
  entry.count++;
  return true;
}

export type ParseResumeResult =
  | { ok: true; fields: ResumeAutofillFields }
  | { ok: false };

/**
 * Parse an already-uploaded resume (by storage key) into autofill fields.
 * Public — runs during the unauthenticated apply flow — so it only ever reads
 * objects under the `resumes/` prefix and never an arbitrary key.
 */
export async function parseResumeAction(input: {
  key: string;
  fileName?: string;
  jobSlug?: string;
  workspaceSlug?: string;
}): Promise<ParseResumeResult> {
  const key = typeof input?.key === "string" ? input.key : "";

  if (!key.startsWith("resumes/") || key.includes("..")) {
    return { ok: false };
  }

  // Rate-limit by IP to prevent API key drain.
  const requestHeaders = await headers();
  const ip =
    requestHeaders.get("cf-connecting-ip") ??
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  if (!checkParseRateLimit(ip)) {
    return { ok: false };
  }

  try {
    const buffer = await storage.read(key);

    if (buffer.byteLength === 0 || buffer.byteLength > maxResumeFileSize) {
      return { ok: false };
    }

    const fileName = input.fileName ?? key.split("/").pop() ?? "resume";
    const { text } = await extractResumeText({ buffer, fileName });

    if (!text.trim()) {
      return { ok: false };
    }

    // Resolve the job's workspace for keyword hints and (if enabled) its AI key.
    // Note: this runs in the public apply flow — the employer opts into AI and
    // bears the cost. Abuse hardening (rate-limit / Turnstile) is tracked separately.
    let jobKeywords: string[] | undefined;
    let aiConfig: Awaited<ReturnType<typeof getWorkspaceAiConfig>> = null;

    if (input.jobSlug) {
      const jobContext = await getPublicJobApplicationContext({
        jobSlug: input.jobSlug,
        workspaceSlug: input.workspaceSlug,
      });
      if (jobContext) {
        jobKeywords = jobContext.keywords;
        aiConfig = await getWorkspaceAiConfig(jobContext.workspaceId);
      }
    }

    if (aiConfig) {
      try {
        const fields = await parseResumeWithAI(aiConfig, text, jobKeywords);
        return { ok: true, fields };
      } catch (error) {
        // Fall back to the heuristic — AI failures must never break apply.
        console.error("AI resume parse failed; using heuristic", error);
      }
    }

    const fields = extractResumeAutofillFields({ fileName, text, jobKeywords });
    return { ok: true, fields };
  } catch (error) {
    console.error("Failed to parse resume", error);
    return { ok: false };
  }
}

export type ApplyJobActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<keyof ApplicationFormValues, string[]>>;
  questionErrors?: Record<string, string[]>;
  educationErrors?: Record<string, Record<string, string[]>>;
  experienceErrors?: Record<string, Record<string, string[]>>;
};

function parseEntryArray<T>(
  raw: FormDataEntryValue | null,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
): T[] {
  if (typeof raw !== "string" || !raw.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      const result = schema.safeParse(entry);
      return result.success ? [result.data] : [];
    });
  } catch {
    return [];
  }
}

function splitEntryErrors(
  parsed: {
    issues: Array<{ path: PropertyKey[]; message: string }>;
  },
  values: Pick<ApplicationFormValues, "educationEntries" | "experienceEntries">,
) {
  const fieldErrors: Record<string, string[]> = {};
  const educationErrors: Record<string, Record<string, string[]>> = {};
  const experienceErrors: Record<string, Record<string, string[]>> = {};

  for (const issue of parsed.issues) {
    const [root, second, third] = issue.path;
    if (root === "educationEntries" && typeof second === "number") {
      const entryId = values.educationEntries[second]?.id ?? `index:${second}`;
      const field = typeof third === "string" ? third : "_entry";
      educationErrors[entryId] ??= {};
      educationErrors[entryId][field] ??= [];
      educationErrors[entryId][field].push(issue.message);
      continue;
    }
    if (root === "experienceEntries" && typeof second === "number") {
      const entryId = values.experienceEntries[second]?.id ?? `index:${second}`;
      const field = typeof third === "string" ? third : "_entry";
      experienceErrors[entryId] ??= {};
      experienceErrors[entryId][field] ??= [];
      experienceErrors[entryId][field].push(issue.message);
      continue;
    }
    if (typeof root === "string") {
      fieldErrors[root] ??= [];
      fieldErrors[root].push(issue.message);
    }
  }

  return { fieldErrors, educationErrors, experienceErrors };
}

export async function submitApplicationAction(
  input: { jobSlug: string; workspaceSlug?: string },
  _previousState: ApplyJobActionState,
  formData: FormData,
): Promise<ApplyJobActionState> {
  const jobContext = await getPublicJobApplicationContext(input);

  if (!jobContext) {
    return {
      status: "error",
      message: "Job not available.",
    };
  }

  // Bot protection — verified against the workspace's Turnstile secret (or the
  // env fallback). When neither is configured, verification is skipped.
  const turnstileToken = formData.get("cf-turnstile-response") as string | null;
  const requestHeaders = await headers();
  const remoteIp =
    requestHeaders.get("cf-connecting-ip") ??
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;
  const turnstileValid = await verifyTurnstileToken(
    turnstileToken,
    jobContext.workspaceId,
    remoteIp,
  );
  if (!turnstileValid) {
    return {
      status: "error",
      message: "Bot verification failed. Please try again.",
    };
  }

  const applicationFormSchema = createApplicationFormSchema(
    jobContext.applicationConfig,
  );
  const values = {
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    location: formData.get("location"),
    headline: formData.get("headline"),
    photoUrl: formData.get("photoUrl"),
    linkedinUrl: formData.get("linkedinUrl"),
    githubUrl: formData.get("githubUrl"),
    websiteUrl: formData.get("websiteUrl"),
    coverLetter: formData.get("coverLetter"),
    educationEntries: parseEntryArray(
      formData.get("educationEntries"),
      candidateEducationEntrySchema,
    ),
    experienceEntries: parseEntryArray(
      formData.get("experienceEntries"),
      candidateExperienceEntrySchema,
    ),
    resumeUrl: formData.get("resumeUrl"),
    resumeKey: formData.get("resumeKey"),
    resumeFileName: formData.get("resumeFileName"),
    resumeFileType: formData.get("resumeFileType"),
    resumeFileSize: formData.get("resumeFileSize"),
    questionAnswers: Object.fromEntries(
      jobContext.applicationConfig.questions.map((question) => [
        question.id,
        String(formData.get(question.id) ?? ""),
      ]),
    ),
    skills: (() => {
      try {
        const raw = formData.get("skills");
        if (typeof raw === "string" && raw.startsWith("[")) {
          return JSON.parse(raw) as string[];
        }
      } catch {}
      return undefined;
    })(),
    experienceYears: (() => {
      const raw = formData.get("experienceYears");
      if (typeof raw === "string" && raw.trim()) {
        const n = Number(raw);
        if (!isNaN(n) && n >= 0) return n;
      }
      return undefined;
    })(),
  };
  const parsed = applicationFormSchema.safeParse(values);

  if (!parsed.success) {
    const split = splitEntryErrors(parsed.error, values);
    return {
      status: "error",
      message: "Review the highlighted fields and try again.",
      fieldErrors: split.fieldErrors,
      educationErrors: split.educationErrors,
      experienceErrors: split.experienceErrors,
    };
  }

  const questionErrors = validateApplicationQuestionAnswers(
    parsed.data.questionAnswers,
    jobContext.applicationConfig.questions,
  );

  if (Object.keys(questionErrors).length > 0) {
    return {
      status: "error",
      message: "Review the highlighted fields and try again.",
      questionErrors,
    };
  }

  const consentGiven = formData.get("consentGiven") === "true";

  // Fetch the consent text from workspace settings (used for the consent record).
  let consentText =
    "I agree to the privacy policy and consent to the processing of my personal data.";
  if (consentGiven) {
    const [settings] = await db
      .select({ consentCheckboxText: workspaceSettings.consentCheckboxText })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, jobContext.workspaceId))
      .limit(1);
    if (settings?.consentCheckboxText) {
      consentText = settings.consentCheckboxText;
    }
  }

  try {
    const result = await createPublicApplication(input, parsed.data, {
      consent: consentGiven
        ? {
            consentText,
            ipAddress: remoteIp,
            userAgent: requestHeaders.get("user-agent") ?? null,
          }
        : null,
    });

    if (!result.ok) {
      return {
        status: "error",
        message: result.message,
      };
    }

    sendApplicationReceivedEmails(result.email);

    // Fire-and-forget auto-score — never blocks the apply response.
    void scheduleAutoScore(result.applicationId, jobContext.workspaceId);

    revalidatePath("/dashboard/candidates");
    return {
      status: "success",
      message:
        "Application received. The hiring team will review it and follow up if there is a fit.",
    };
  } catch (error) {
    console.error("Failed to submit application", error);

    return {
      status: "error",
      message:
        "We couldn't submit your application. Please try again in a moment.",
    };
  }
}
