import { z } from "zod";

import type { JobApplicationQuestion } from "@/features/jobs/config";
import {
  allowedResumeContentTypes,
  maxResumeFileSize,
} from "@/lib/storage-validation";

const optionalText = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  },
  z.string().optional(),
);

const optionalHttpsUrl = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  },
  z
    .string()
    .url("Enter a valid URL.")
    .refine(
      (value) => value.startsWith("https://"),
      "URL must start with https://",
    )
    .optional(),
);

const requiredResumeUrlSchema = z
  .string()
  .trim()
  .min(1, "Resume is required.")
  .refine(
    (value) => value.startsWith("/uploads/") || URL.canParse(value),
    "Resume upload is invalid.",
  );

const optionalResumeUrlSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value : undefined),
  requiredResumeUrlSchema.optional(),
);

function createResumeFieldsSchema(resumeRequired: boolean) {
  if (resumeRequired) {
    return {
      resumeUrl: requiredResumeUrlSchema,
      resumeKey: z.string().trim().min(1, "Resume upload is invalid."),
      resumeFileName: z.string().trim().min(1, "Resume filename is required."),
      resumeFileType: z.enum(allowedResumeContentTypes),
      resumeFileSize: z.coerce
        .number()
        .int()
        .positive("Resume is required.")
        .max(maxResumeFileSize, "Resume must be 10MB or smaller."),
    };
  }

  return {
    resumeUrl: optionalResumeUrlSchema,
    resumeKey: optionalText,
    resumeFileName: optionalText,
    resumeFileType: z
      .preprocess(
        (value) => (typeof value === "string" && value.trim() ? value : undefined),
        z.enum(allowedResumeContentTypes).optional(),
      ),
    resumeFileSize: z.preprocess(
      (value) => (value === "" || value == null ? undefined : value),
      z.coerce
        .number()
        .int()
        .positive()
        .max(maxResumeFileSize, "Resume must be 10MB or smaller.")
        .optional(),
    ),
  };
}

export function createApplicationFormSchema(input: { resumeRequired: boolean }) {
  return z.object({
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  email: z
    .string()
    .trim()
    .email("Enter a valid email address.")
    .transform((value) => value.toLowerCase()),
  phone: optionalText,
  location: optionalText,
  linkedinUrl: optionalHttpsUrl,
  githubUrl: optionalHttpsUrl,
  websiteUrl: optionalHttpsUrl,
  ...createResumeFieldsSchema(input.resumeRequired),
  questionAnswers: z.record(z.string(), z.string()).default({}),
  });
}

export const applicationFormSchema = createApplicationFormSchema({
  resumeRequired: true,
});

export type ApplicationFormValues = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  location?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  websiteUrl?: string;
  resumeUrl?: string;
  resumeKey?: string;
  resumeFileName?: string;
  resumeFileType?:
    | "application/pdf"
    | "application/msword"
    | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  resumeFileSize?: number;
  questionAnswers: Record<string, string>;
  skills?: string[];
  experienceYears?: number;
};

export function validateApplicationQuestionAnswers(
  answers: Record<string, string>,
  questions: readonly JobApplicationQuestion[],
) {
  const errors: Record<string, string[]> = {};

  for (const question of questions) {
    const value = answers[question.id]?.trim() ?? "";

    if (question.required && value.length === 0) {
      errors[question.id] = ["This question is required."];
      continue;
    }

    if (
      question.minLength &&
      value.length > 0 &&
      value.length < question.minLength
    ) {
      errors[question.id] = [
        `Enter at least ${question.minLength} characters.`,
      ];
      continue;
    }

    if (
      question.type === "select" &&
      value.length > 0 &&
      question.options &&
      !question.options.includes(value)
    ) {
      errors[question.id] = ["Select a valid option."];
    }

    if (question.type === "url" && value.length > 0) {
      try {
        const url = new URL(value);

        if (url.protocol !== "https:") {
          errors[question.id] = ["URL must start with https://"];
        }
      } catch {
        errors[question.id] = ["Enter a valid URL."];
      }
    }
  }

  return errors;
}
