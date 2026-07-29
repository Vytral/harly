"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";

import { db, workspaceSettings } from "@harly/db";
import { createPublicApplication } from "@/features/applications/data";
import {
  CAPTCHA_RESPONSE_FIELDS,
  verifyCaptchaToken,
} from "@/lib/captcha";
import { clientIp, enforceRateLimit } from "@/server/api/ratelimit";
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
import {
  isWorkspaceStorageKey,
  maxResumeFileSize,
} from "@/lib/storage-validation";
import { getWorkspaceAiConfig } from "@/lib/ai/config";
import { parseResumeWithAI } from "@/lib/ai/surfaces/parse-resume";
import { getServerLogger } from "@/lib/logger";

const aiParseLogger = getServerLogger().child({ component: "public-ai-parse" });
import {
  extractResumeAutofillFields,
  type ResumeAutofillFields,
} from "@/features/applications/resume-autofill";
import { scheduleAutoScore } from "@/features/applications/auto-score";
import { scheduleAutoDuplicateCheck } from "@/features/applications/auto-duplicates";

const PARSE_LIMIT = 5;
const PARSE_WINDOW_MS = 60_000;

export type ParseResumeResult =
  | { ok: true; fields: ResumeAutofillFields }
  | { ok: false };

/**
 * Parse an already-uploaded resume (by storage key) into autofill fields.
 * Public , runs during the unauthenticated apply flow , so it only ever reads
 * a resume that is namespaced to the job's workspace.
 */
export async function parseResumeAction(input: {
  key: string;
  fileName?: string;
  jobSlug?: string;
  workspaceSlug?: string;
}): Promise<ParseResumeResult> {
  const key = typeof input?.key === "string" ? input.key : "";

  if (key.includes("..")) {
    return { ok: false };
  }

  // Rate-limit by IP to prevent API key drain.
  const requestHeaders = await headers();
  const ip = clientIp(
    new Request("http://harly.local", {
      headers: {
        "x-forwarded-for": requestHeaders.get("x-forwarded-for") ?? "",
        "x-real-ip": requestHeaders.get("x-real-ip") ?? "",
      },
    }),
  );
  try {
    await enforceRateLimit(`public:resume-parse:${ip}`, {
      limit: PARSE_LIMIT,
      windowMs: PARSE_WINDOW_MS,
    });
  } catch {
    return { ok: false };
  }

  const jobContext = input.jobSlug
    ? await getPublicJobApplicationContext({
        jobSlug: input.jobSlug,
        workspaceSlug: input.workspaceSlug,
      })
    : null;
  if (
    !jobContext ||
    !isWorkspaceStorageKey(jobContext.workspaceId, key, "resumes")
  ) {
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
    // Note: this runs in the public apply flow , the employer opts into AI and
    // bears the cost. Abuse hardening (rate-limit / Turnstile) is tracked separately.
    const jobKeywords = jobContext.keywords;
    let aiConfig: Awaited<ReturnType<typeof getWorkspaceAiConfig>> = null;

    aiConfig = await getWorkspaceAiConfig(jobContext.workspaceId);

    if (aiConfig) {
      const startedAt = Date.now();
      let ok = false;
      try {
        const fields = await parseResumeWithAI(aiConfig, text, jobKeywords);
        ok = true;
        return { ok: true, fields };
      } catch (error) {
        // Fall back to the heuristic , AI failures must never break apply.
        console.error("AI resume parse failed; using heuristic", error);
      } finally {
        // Attribution for the employer's public AI spend (IA-09): who consumed
        // the key, on which job, via which provider/model, and how long it took.
        // Deferred so it never delays the apply response.
        after(() => {
          aiParseLogger.info(
            {
              workspaceId: jobContext.workspaceId,
              ip,
              jobSlug: input.jobSlug,
              fileName,
              provider: aiConfig?.provider,
              modelId: aiConfig?.modelId,
              ok,
              durationMs: Date.now() - startedAt,
            },
            "public resume AI parse",
          );
        });
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
  schema: {
    safeParse: (
      value: unknown,
    ) => { success: true; data: T } | { success: false };
  },
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

  // Bot protection , verified against the workspace's active CAPTCHA secret (or
  // the env fallback). A global provider secret makes verification mandatory
  // for every workspace (enforced), consistent with the public apply API. Each
  // vendor widget injects its own hidden response field, so read whichever is
  // present.
  const captchaToken =
    CAPTCHA_RESPONSE_FIELDS.map(
      (field) => formData.get(field) as string | null,
    ).find((value) => value && value.length > 0) ?? null;
  const requestHeaders = await headers();
  const remoteIp = clientIp({
    headers: new Headers({
      "x-forwarded-for": requestHeaders.get("x-forwarded-for") ?? "",
      "x-real-ip": requestHeaders.get("x-real-ip") ?? "",
      "cf-connecting-ip": requestHeaders.get("cf-connecting-ip") ?? "",
    }),
  } as Request);

  // Keep the hosted anonymous form aligned with the public API. CAPTCHA is an
  // additional control, but it may be disabled per workspace, so it cannot be
  // the only protection against application spam.
  try {
    await enforceRateLimit(`public:apply:${remoteIp}`, {
      limit: 10,
      windowMs: 60_000,
    });
  } catch {
    return {
      status: "error",
      message: "Too many attempts. Please try again in a minute.",
    };
  }

  const captchaValid = await verifyCaptchaToken(
    captchaToken,
    jobContext.workspaceId,
    remoteIp,
    true,
  );
  if (!captchaValid) {
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

  // Resolve the wording on the server, rather than trusting a browser value.
  let consentText =
    "I agree to the privacy policy and consent to the processing of my personal data.";
  const [settings] = await db
    .select({
      consentCheckboxText: workspaceSettings.consentCheckboxText,
      legalConfigured: workspaceSettings.legalConfigured,
      legalPages: workspaceSettings.legalPages,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, jobContext.workspaceId))
    .limit(1);
  if (settings?.legalConfigured && !consentGiven) {
    return {
      status: "error",
      message:
        "You must agree to the privacy policy to submit your application.",
    };
  }
  if (settings?.consentCheckboxText) {
    consentText = settings.consentCheckboxText;
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

    void sendApplicationReceivedEmails(result.email);

    // Run opted-in AI automations after the response without risking a dropped
    // fire-and-forget promise in serverless runtimes.
    after(async () => {
      await Promise.allSettled([
        scheduleAutoScore(result.applicationId, jobContext.workspaceId),
        scheduleAutoDuplicateCheck(result.candidateId, jobContext.workspaceId),
      ]);
    });

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
