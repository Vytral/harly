import { z } from "zod";
import { isPublishableJobDescription, jobReadableText } from "@harly/validators";

import { slugify } from "@/lib/utils";
import {
  DEFAULT_EVALUATION_MODE,
  EVALUATION_MODES,
  type EvaluationMode,
} from "@/lib/evaluation/mode";
import {
  defaultJobApplicationConfig,
  parseJobApplicationQuestions,
  parseJobContentSections,
  parseKeywords,
  parseOfficePhotos,
  type ApplicationFieldVisibility,
  type JobApplicationConfig,
  type JobBoardConfig,
  type JobContentSection,
} from "./config";

// Null/undefined-safe: conditionally-rendered fields submit `null`
// (FormData.get) and removed fields are missing entirely (`undefined`).
// Coalesce both to "" before the string schema so the key stays optional.
const optionalText = z.preprocess(
  (value) => (value == null ? "" : value),
  z
    .string()
    .trim()
    .transform((value) => (value.length > 0 ? value : undefined)),
);

// Raw string fields (JSON blobs, HTML): FormData.get yields null when absent.
const optionalRaw = z.preprocess(
  (value) => (value == null ? undefined : value),
  z.string().optional(),
);

const optionalAmount = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.coerce.number().int().nonnegative().optional(),
);

const optionalSlug = z.preprocess(
  (value) => (value == null ? "" : value),
  z
    .string()
    .trim()
    .transform((value) => (value.length > 0 ? slugify(value) : undefined)),
);

const optionalDate = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.coerce.date().optional(),
);

const fieldVisibility = (defaultValue: ApplicationFieldVisibility) =>
  z.preprocess(
    (value) =>
      value == null || value === ""
        ? defaultValue
        : value,
    z.enum(["required", "optional", "disabled"]),
  );

export const jobFormSchema = z
  .object({
    title: z.string().trim().min(1, "Add a job title to continue."),
    slug: optionalSlug,
    department: optionalText,
    sector: optionalText,
    location: optionalText,
    // Structural columns: sensible defaults so a title alone is enough.
    employmentType: z.preprocess(
      (value) => (value == null || value === "" ? undefined : value),
      z
        .enum(["full_time", "part_time", "contract", "internship"])
        .default("full_time"),
    ),
    workplaceType: z.preprocess(
      (value) => (value == null || value === "" ? undefined : value),
      z.enum(["remote", "hybrid", "onsite"]).default("remote"),
    ),
    experienceLevel: optionalText,
    education: optionalText,
    // Absent (field hidden when AI isn't configured) or null -> default.
    evaluationMode: z.preprocess(
      (value) => (value == null || value === "" ? undefined : value),
      z.enum(EVALUATION_MODES).default(DEFAULT_EVALUATION_MODE),
    ),
    keywordsJson: optionalRaw,
    description: optionalRaw,
    contentSectionsJson: optionalRaw,
    salaryMin: optionalAmount,
    salaryMax: optionalAmount,
    currency: optionalText,
    salaryPeriod: z.preprocess(
      (value) => (value === "" || value == null ? undefined : value),
      z.enum(["annual", "monthly"]).optional(),
    ),
    officeAddress: optionalText,
    jobLocationCountry: optionalText,
    jobLocationRegion: optionalText,
    remoteEligibleCountries: optionalText,
    validThrough: optionalDate,
    officePhotosJson: optionalRaw,
    applicationPhoneVisibility: fieldVisibility(
      defaultJobApplicationConfig.sections.personal.phone.visibility,
    ),
    applicationAddressVisibility: fieldVisibility(
      defaultJobApplicationConfig.sections.personal.address.visibility,
    ),
    applicationPhotoVisibility: fieldVisibility(
      defaultJobApplicationConfig.sections.personal.photo.visibility,
    ),
    applicationHeadlineVisibility: fieldVisibility(
      defaultJobApplicationConfig.sections.personal.headline.visibility,
    ),
    applicationResumeVisibility: fieldVisibility(
      defaultJobApplicationConfig.sections.profile.resume.visibility,
    ),
    applicationLinkedinVisibility: fieldVisibility(
      defaultJobApplicationConfig.sections.profile.linkedinUrl.visibility,
    ),
    applicationGithubVisibility: fieldVisibility(
      defaultJobApplicationConfig.sections.profile.githubUrl.visibility,
    ),
    applicationWebsiteVisibility: fieldVisibility(
      defaultJobApplicationConfig.sections.profile.websiteUrl.visibility,
    ),
    applicationEducationVisibility: fieldVisibility(
      defaultJobApplicationConfig.sections.profile.education.visibility,
    ),
    applicationExperienceVisibility: fieldVisibility(
      defaultJobApplicationConfig.sections.profile.experience.visibility,
    ),
    applicationCoverLetterVisibility: fieldVisibility(
      defaultJobApplicationConfig.sections.details.coverLetter.visibility,
    ),
    applicationQuestionsJson: optionalRaw,
  })
  .superRefine((values, ctx) => {
    if (
      values.salaryMin != null &&
      values.salaryMax != null &&
      values.salaryMin > values.salaryMax
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["salaryMax"],
        message:
          "Maximum salary must be greater than or equal to minimum salary.",
      });
    }

    if (
      (values.salaryMin != null || values.salaryMax != null) &&
      !values.currency
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["currency"],
        message: "Currency is required when a salary amount is specified.",
      });
    }

    if (
      (values.salaryMin != null || values.salaryMax != null) &&
      !values.salaryPeriod
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["salaryPeriod"],
        message: "Pay period is required when a salary amount is specified.",
      });
    }
  })
  .transform((values) => {
    const applicationConfig: JobApplicationConfig = {
      resumeRequired: values.applicationResumeVisibility === "required",
      profileLinks: {
        linkedin: {
          enabled: values.applicationLinkedinVisibility !== "disabled",
          required: values.applicationLinkedinVisibility === "required",
        },
        github: {
          enabled: values.applicationGithubVisibility !== "disabled",
          required: values.applicationGithubVisibility === "required",
        },
        website: {
          enabled: values.applicationWebsiteVisibility !== "disabled",
          required: values.applicationWebsiteVisibility === "required",
        },
      },
      sections: {
        personal: {
          phone: { visibility: values.applicationPhoneVisibility },
          address: { visibility: values.applicationAddressVisibility },
          photo: { visibility: values.applicationPhotoVisibility },
          headline: { visibility: values.applicationHeadlineVisibility },
        },
        profile: {
          resume: { visibility: values.applicationResumeVisibility },
          linkedinUrl: { visibility: values.applicationLinkedinVisibility },
          githubUrl: { visibility: values.applicationGithubVisibility },
          websiteUrl: { visibility: values.applicationWebsiteVisibility },
          education: { visibility: values.applicationEducationVisibility },
          experience: { visibility: values.applicationExperienceVisibility },
        },
        details: {
          coverLetter: { visibility: values.applicationCoverLetterVisibility },
        },
      },
      questions: parseJobApplicationQuestions(values.applicationQuestionsJson),
    };

    const boardConfig: JobBoardConfig = {};

    const contentSections: JobContentSection[] = parseJobContentSections(
      values.contentSectionsJson,
    );

    return {
      title: values.title,
      slug: values.slug,
      department: values.department,
      sector: values.sector,
      location: values.location,
      employmentType: values.employmentType,
      workplaceType: values.workplaceType,
      experienceLevel: values.experienceLevel,
      education: values.education,
      evaluationMode: values.evaluationMode as EvaluationMode,
      keywords: parseKeywords(values.keywordsJson),
      // Column is NOT NULL; a sections-only job submits no description.
      description: values.description ?? "",
      contentSections,
      salaryMin: values.salaryMin,
      salaryMax: values.salaryMax,
      currency: values.currency,
      salaryPeriod: values.salaryPeriod,
      officeAddress: values.officeAddress,
      jobLocationCountry: values.jobLocationCountry?.toUpperCase(),
      jobLocationRegion: values.jobLocationRegion,
      remoteEligibleCountries: (values.remoteEligibleCountries ?? "").split(",").map((value) => value.trim().toUpperCase()).filter((value) => /^[A-Z]{2}$/.test(value)),
      validThrough: values.validThrough,
      officePhotos: parseOfficePhotos(values.officePhotosJson),
      applicationConfig,
      boardConfig,
    };
  });

/**
 * Publish-time requirements. Saving a draft only needs a title; a posting that
 * goes public needs something for candidates to read: a description or at
 * least one filled section. Shared by the form (inline hint), the create /
 * status actions and tests.
 */
export function getPublishBlockers(input: {
  description?: string | null;
  contentSections?: unknown;
}): string[] {
  const hasDescription = isPublishableJobDescription(input.description);
  const hasSections = parseJobContentSections(input.contentSections).some(
    (section) => jobReadableText(section.body).length > 0,
  );
  return hasDescription || hasSections
    ? []
    : [
        "Add a description or fill in at least one section before publishing. You can still save a draft without it.",
      ];
}

export const jobStatusSchema = z.enum(["draft", "open", "closed"]);

export type JobFormValues = z.infer<typeof jobFormSchema>;
export type JobStatus = z.infer<typeof jobStatusSchema>;
