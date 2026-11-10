import { z } from "zod";

import type {
  ApplicationFieldVisibility,
  JobApplicationConfig,
  JobApplicationQuestion,
} from "@/features/jobs/config";
import { isFieldEnabled, isFieldRequired } from "@/features/jobs/config";
import { translatorFor } from "@/i18n/translator";
import {
  allowedResumeContentTypes,
  maxResumeFileSize,
} from "@/lib/storage-validation";

/**
 * Validation messages. Form actions pass the translator for the applicant's
 * language; the public API keeps the English default.
 */
export type ValidationTranslate = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;
const englishMessages: ValidationTranslate = translatorFor(
  "en",
  "server.applications.validation",
);

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

function createOptionalHttpsUrl(t: ValidationTranslate) {
  return z.preprocess(
    (value) => {
      if (typeof value !== "string") {
        return undefined;
      }

      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    z
      .string()
      .url(t("urlInvalid"))
      .refine(
        (value) => value.startsWith("https://"),
        t("urlNotHttps"),
      )
      .optional(),
  );
}

function createRequiredResumeUrlSchema(t: ValidationTranslate) {
  return z
    .string()
    .trim()
    .min(1, t("resumeRequired"))
    .refine(
      (value) =>
        value.startsWith("/uploads/") ||
        value.startsWith("/api/storage/file?key=") ||
        URL.canParse(value),
      t("resumeInvalid"),
    );
}

function createOptionalResumeUrlSchema(t: ValidationTranslate) {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value : undefined),
    createRequiredResumeUrlSchema(t).optional(),
  );
}

function createOptionalDateString(t: ValidationTranslate) {
  return z.preprocess(
    (value) => {
      if (typeof value !== "string") {
        return undefined;
      }
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    z.string().regex(/^\d{4}(?:-\d{2}){0,2}$/, t("dateInvalid")).optional(),
  );
}

export function createCandidateEducationEntrySchema(
  t: ValidationTranslate = englishMessages,
) {
  return z.object({
    id: z.string().trim().min(1),
    school: z.string().trim().min(1, t("schoolRequired")),
    degree: optionalText,
    field: optionalText,
    startDate: createOptionalDateString(t),
    endDate: createOptionalDateString(t),
    description: optionalText,
  });
}

export function createCandidateExperienceEntrySchema(
  t: ValidationTranslate = englishMessages,
) {
  return z
    .object({
      id: z.string().trim().min(1),
      company: z.string().trim().min(1, t("companyRequired")),
      title: z.string().trim().min(1, t("jobTitleRequired")),
      startDate: createOptionalDateString(t),
      endDate: createOptionalDateString(t),
      current: z.boolean().optional(),
      location: optionalText,
      description: optionalText,
    })
    .transform((value) => ({
      ...value,
      endDate: value.current ? undefined : value.endDate,
    }));
}

export const candidateEducationEntrySchema =
  createCandidateEducationEntrySchema();
export const candidateExperienceEntrySchema =
  createCandidateExperienceEntrySchema();

export type CandidateEducationEntryInput = z.infer<
  typeof candidateEducationEntrySchema
>;
export type CandidateExperienceEntryInput = z.infer<
  typeof candidateExperienceEntrySchema
>;

function createResumeFieldsSchema(
  enabled: boolean,
  required: boolean,
  t: ValidationTranslate,
) {
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
      resumeUrl: createRequiredResumeUrlSchema(t),
      resumeKey: z.string().trim().min(1, t("resumeInvalid")),
      resumeFileName: z.string().trim().min(1, t("resumeFilenameRequired")),
      resumeFileType: z.enum(allowedResumeContentTypes),
      resumeFileSize: z.coerce
        .number()
        .int()
        .positive(t("resumeRequired"))
        .max(maxResumeFileSize, t("resumeTooLarge")),
    };
  }

  return {
    resumeUrl: createOptionalResumeUrlSchema(t),
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
        .max(maxResumeFileSize, t("resumeTooLarge"))
        .optional(),
    ),
  };
}

function optionalOrRequiredText(required: boolean, message: string) {
  return required
    ? z.string().trim().min(1, message)
    : optionalText;
}

function optionalOrRequiredHttpsUrl(
  required: boolean,
  message: string,
  t: ValidationTranslate,
) {
  return required
    ? z
        .string()
        .trim()
        .min(1, message)
        .url(t("urlInvalid"))
        .refine((value) => value.startsWith("https://"), t("urlNotHttps"))
    : createOptionalHttpsUrl(t);
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
  t: ValidationTranslate,
) {
  return enabled
    ? optionalOrRequiredHttpsUrl(required, message, t)
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
  t: ValidationTranslate = englishMessages,
) {
  const personal = applicationConfig.sections.personal;
  const profile = applicationConfig.sections.profile;
  const details = applicationConfig.sections.details;
  const educationVisibility = profile.education?.visibility ?? "optional";
  const experienceVisibility = profile.experience?.visibility ?? "optional";

  return z.object({
    firstName: z.string().trim().min(1, t("firstNameRequired")),
    lastName: z.string().trim().min(1, t("lastNameRequired")),
    email: z
      .string()
      .trim()
      .email(t("emailInvalid"))
      .transform((value) => value.toLowerCase()),
    phone: textFieldForConfig(
      isFieldEnabled(personal.phone),
      isFieldRequired(personal.phone),
      t("phoneRequired"),
    ),
    address: textFieldForConfig(
      isFieldEnabled(personal.address),
      isFieldRequired(personal.address),
      t("addressRequired"),
    ),
    // Legacy client compatibility: older custom forms still submit `location`.
    // A disabled address field must not be accepted through the legacy alias.
    location: textFieldForConfig(
      isFieldEnabled(personal.address),
      false,
      t("addressRequired"),
    ),
    headline: textFieldForConfig(
      isFieldEnabled(personal.headline),
      isFieldRequired(personal.headline),
      t("headlineRequired"),
    ),
    photoUrl: httpsUrlFieldForConfig(
      isFieldEnabled(personal.photo),
      isFieldRequired(personal.photo),
      t("photoRequired"),
      t,
    ),
    linkedinUrl: httpsUrlFieldForConfig(
      isFieldEnabled(profile.linkedinUrl),
      isFieldRequired(profile.linkedinUrl),
      t("linkedinRequired"),
      t,
    ),
    githubUrl: httpsUrlFieldForConfig(
      isFieldEnabled(profile.githubUrl),
      isFieldRequired(profile.githubUrl),
      t("githubRequired"),
      t,
    ),
    websiteUrl: httpsUrlFieldForConfig(
      isFieldEnabled(profile.websiteUrl),
      isFieldRequired(profile.websiteUrl),
      t("websiteRequired"),
      t,
    ),
    coverLetter: textFieldForConfig(
      isFieldEnabled(details.coverLetter),
      isFieldRequired(details.coverLetter),
      t("coverLetterRequired"),
    ),
    educationEntries: collectionFieldForConfig(
      educationVisibility,
      createCandidateEducationEntrySchema(t),
      t("educationRequired"),
    ),
    experienceEntries: collectionFieldForConfig(
      experienceVisibility,
      createCandidateExperienceEntrySchema(t),
      t("experienceRequired"),
    ),
    ...createResumeFieldsSchema(
      isFieldEnabled(profile.resume),
      isFieldRequired(profile.resume),
      t,
    ),
    questionAnswers: z.record(z.string(), z.string().max(10_000)).default({}),
    // Derived from the parsed resume; previously stripped by the schema.
    skills: z.preprocess(
      (value) =>
        Array.isArray(value)
          ? value
              .filter((item): item is string => typeof item === "string")
              .map((item) => item.trim().slice(0, 60))
              .filter(Boolean)
              .slice(0, 50)
          : undefined,
      z.array(z.string()).optional(),
    ),
    experienceYears: z.preprocess(
      (value) =>
        typeof value === "number" && value >= 0 && value <= 80 ? value : undefined,
      z.number().optional(),
    ),
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
  t: ValidationTranslate = englishMessages,
) {
  const errors: Record<string, string[]> = {};

  for (const question of questions) {
    if (question.type === "info") {
      continue;
    }

    const value = answers[question.id]?.trim() ?? "";

    if (question.required && value.length === 0) {
      errors[question.id] = [t("questionRequired")];
      continue;
    }

    if (question.type === "consent" && question.required && value !== "agree") {
      errors[question.id] = [t("consentRequired")];
      continue;
    }

    if (
      question.minLength &&
      value.length > 0 &&
      value.length < question.minLength
    ) {
      errors[question.id] = [t("minLength", { min: question.minLength })];
      continue;
    }

    if (
      question.type === "select" &&
      value.length > 0 &&
      question.options &&
      !question.options.includes(value)
    ) {
      errors[question.id] = [t("optionInvalid")];
    }

    if (question.type === "url" && value.length > 0) {
      try {
        const url = new URL(value);

        if (url.protocol !== "https:") {
          errors[question.id] = [t("urlNotHttps")];
        }
      } catch {
        errors[question.id] = [t("urlInvalid")];
      }
    }
  }

  return errors;
}
