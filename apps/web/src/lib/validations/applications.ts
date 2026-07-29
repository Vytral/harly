import { z } from "zod";

import type {
  ApplicationFieldVisibility,
  JobApplicationConfig,
  JobApplicationQuestion,
} from "@/features/jobs/config";
import { isFieldEnabled, isFieldRequired } from "@/features/jobs/config";
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
    (value) =>
      value.startsWith("/uploads/") ||
      value.startsWith("/api/storage/file?key=") ||
      URL.canParse(value),
    "Resume upload is invalid.",
  );

const optionalResumeUrlSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value : undefined),
  requiredResumeUrlSchema.optional(),
);

const optionalDateString = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  },
  z.string().regex(/^\d{4}(?:-\d{2}){0,2}$/, "Enter a valid date.").optional(),
);

export const candidateEducationEntrySchema = z.object({
  id: z.string().trim().min(1),
  school: z.string().trim().min(1, "School is required."),
  degree: optionalText,
  field: optionalText,
  startDate: optionalDateString,
  endDate: optionalDateString,
  description: optionalText,
});

export const candidateExperienceEntrySchema = z
  .object({
    id: z.string().trim().min(1),
    company: z.string().trim().min(1, "Company is required."),
    title: z.string().trim().min(1, "Job title is required."),
    startDate: optionalDateString,
    endDate: optionalDateString,
    current: z.boolean().optional(),
    location: optionalText,
    description: optionalText,
  })
  .transform((value) => ({
    ...value,
    endDate: value.current ? undefined : value.endDate,
  }));

export type CandidateEducationEntryInput = z.infer<
  typeof candidateEducationEntrySchema
>;
export type CandidateExperienceEntryInput = z.infer<
  typeof candidateExperienceEntrySchema
>;

function createResumeFieldsSchema(enabled: boolean, required: boolean) {
  if (!enabled) {
    return {
      resumeUrl: z.any().optional().transform(() => undefined),
      resumeKey: z.any().optional().transform(() => undefined),
      resumeFileName: z.any().optional().transform(() => undefined),
      resumeFileType: z.any().optional().transform(() => undefined),
      resumeFileSize: z.any().optional().transform(() => undefined),
    };
  }

  if (required) {
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
    resumeFileType: z.preprocess(
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

function optionalOrRequiredText(required: boolean, message: string) {
  return required
    ? z.string().trim().min(1, message)
    : optionalText;
}

function optionalOrRequiredHttpsUrl(required: boolean, message: string) {
  return required
    ? z
        .string()
        .trim()
        .min(1, message)
        .url("Enter a valid URL.")
        .refine((value) => value.startsWith("https://"), "URL must start with https://")
    : optionalHttpsUrl;
}

function textFieldForConfig(
  enabled: boolean,
  required: boolean,
  message: string,
) {
  return enabled
    ? optionalOrRequiredText(required, message)
    : z.any().optional().transform(() => undefined);
}

function httpsUrlFieldForConfig(
  enabled: boolean,
  required: boolean,
  message: string,
) {
  return enabled
    ? optionalOrRequiredHttpsUrl(required, message)
    : z.any().optional().transform(() => undefined);
}

function collectionFieldForConfig<T extends z.ZodTypeAny>(
  visibility: ApplicationFieldVisibility,
  schema: T,
  message: string,
) {
  if (visibility === "disabled") {
    return z.any().optional().transform(() => []);
  }

  const arraySchema = z.array(schema).max(20);
  if (visibility === "required") {
    return arraySchema.min(1, message);
  }
  return arraySchema.default([]);
}

export function createApplicationFormSchema(
  applicationConfig: JobApplicationConfig,
) {
  const personal = applicationConfig.sections.personal;
  const profile = applicationConfig.sections.profile;
  const details = applicationConfig.sections.details;
  const educationVisibility = profile.education?.visibility ?? "optional";
  const experienceVisibility = profile.experience?.visibility ?? "optional";

  return z.object({
    firstName: z.string().trim().min(1, "First name is required."),
    lastName: z.string().trim().min(1, "Last name is required."),
    email: z
      .string()
      .trim()
      .email("Enter a valid email address.")
      .transform((value) => value.toLowerCase()),
    phone: textFieldForConfig(
      isFieldEnabled(personal.phone),
      isFieldRequired(personal.phone),
      "Phone is required.",
    ),
    address: textFieldForConfig(
      isFieldEnabled(personal.address),
      isFieldRequired(personal.address),
      "Address is required.",
    ),
    // Legacy client compatibility: older custom forms still submit `location`.
    location: optionalText,
    headline: textFieldForConfig(
      isFieldEnabled(personal.headline),
      isFieldRequired(personal.headline),
      "Headline is required.",
    ),
    photoUrl: httpsUrlFieldForConfig(
      isFieldEnabled(personal.photo),
      isFieldRequired(personal.photo),
      "Photo is required.",
    ),
    linkedinUrl: httpsUrlFieldForConfig(
      isFieldEnabled(profile.linkedinUrl),
      isFieldRequired(profile.linkedinUrl),
      "LinkedIn is required.",
    ),
    githubUrl: httpsUrlFieldForConfig(
      isFieldEnabled(profile.githubUrl),
      isFieldRequired(profile.githubUrl),
      "GitHub is required.",
    ),
    websiteUrl: httpsUrlFieldForConfig(
      isFieldEnabled(profile.websiteUrl),
      isFieldRequired(profile.websiteUrl),
      "Website is required.",
    ),
    coverLetter: textFieldForConfig(
      isFieldEnabled(details.coverLetter),
      isFieldRequired(details.coverLetter),
      "Cover letter is required.",
    ),
    educationEntries: collectionFieldForConfig(
      educationVisibility,
      candidateEducationEntrySchema,
      "Add at least one education entry.",
    ),
    experienceEntries: collectionFieldForConfig(
      experienceVisibility,
      candidateExperienceEntrySchema,
      "Add at least one experience entry.",
    ),
    ...createResumeFieldsSchema(
      isFieldEnabled(profile.resume),
      isFieldRequired(profile.resume),
    ),
    questionAnswers: z.record(z.string(), z.string()).default({}),
  });
}

export const applicationFormSchema = createApplicationFormSchema({
  resumeRequired: true,
  profileLinks: {
    linkedin: { enabled: true, required: false },
    github: { enabled: true, required: false },
    website: { enabled: true, required: false },
  },
  sections: {
    personal: {
      phone: { visibility: "optional" },
      address: { visibility: "optional" },
      photo: { visibility: "disabled" },
      headline: { visibility: "optional" },
    },
    profile: {
      resume: { visibility: "required" },
      linkedinUrl: { visibility: "optional" },
      githubUrl: { visibility: "optional" },
      websiteUrl: { visibility: "optional" },
      education: { visibility: "optional" },
      experience: { visibility: "optional" },
    },
    details: {
      coverLetter: { visibility: "optional" },
    },
  },
  questions: [],
});

export type ApplicationFormValues = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: string;
  location?: string;
  headline?: string;
  photoUrl?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  websiteUrl?: string;
  coverLetter?: string;
  educationEntries: CandidateEducationEntryInput[];
  experienceEntries: CandidateExperienceEntryInput[];
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
