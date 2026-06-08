"use server";

import { revalidatePath } from "next/cache";
import { createElement } from "react";
import {
  ApplicationReceivedCandidate,
  ApplicationReceivedRecruiter,
  applicationReceivedCandidateSubject,
  applicationReceivedRecruiterSubject,
} from "@harly/emails";

import { createPublicApplication } from "@/features/applications/data";
import {
  createApplicationFormSchema,
  type ApplicationFormValues,
  validateApplicationQuestionAnswers,
} from "@/lib/validations/applications";
import { getPublicJobApplicationContext } from "@/features/applications/data";
import { sendEmail } from "@/lib/email";
import { storage } from "@/lib/storage";
import { extractResumeText } from "@/lib/resume/extract-text";
import { maxResumeFileSize } from "@/lib/storage-validation";
import { getWorkspaceAiConfig } from "@/lib/ai/config";
import { parseResumeWithAI } from "@/lib/ai/surfaces/parse-resume";
import {
  extractResumeAutofillFields,
  type ResumeAutofillFields,
} from "@/features/applications/resume-autofill";

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
};

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

  const applicationFormSchema = createApplicationFormSchema({
    resumeRequired: jobContext.applicationConfig.resumeRequired,
  });
  const parsed = applicationFormSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    location: formData.get("location"),
    linkedinUrl: formData.get("linkedinUrl"),
    githubUrl: formData.get("githubUrl"),
    websiteUrl: formData.get("websiteUrl"),
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
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Review the highlighted fields and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors,
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

  try {
    const result = await createPublicApplication(input, parsed.data);

    if (!result.ok) {
      return {
        status: "error",
        message: result.message,
      };
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const jobBoardUrl = `${appUrl}/board/${result.email.workspaceSlug}`;
    const dashboardUrl = `${appUrl}/dashboard/candidates`;
    const candidateEmail = sendEmail({
      to: result.email.candidateEmail,
      subject: applicationReceivedCandidateSubject({
        jobTitle: result.email.jobTitle,
      }),
      react: createElement(ApplicationReceivedCandidate, {
        candidateName: result.email.candidateFirstName,
        jobTitle: result.email.jobTitle,
        companyName: result.email.workspaceName,
        jobBoardUrl,
      }),
    });
    const recruiterEmails = result.email.ownerEmails.map((ownerEmail) =>
      sendEmail({
        to: ownerEmail,
        subject: applicationReceivedRecruiterSubject({
          candidateName: result.email.candidateName,
          jobTitle: result.email.jobTitle,
        }),
        react: createElement(ApplicationReceivedRecruiter, {
          candidateName: result.email.candidateName,
          candidateEmail: result.email.candidateEmail,
          jobTitle: result.email.jobTitle,
          dashboardUrl,
        }),
      }),
    );

    void Promise.allSettled([candidateEmail, ...recruiterEmails]);

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
