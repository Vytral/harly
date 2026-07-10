import { z } from "zod";

import { slugify } from "@/lib/utils";
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
    title: z.string().trim().min(3, "Title must be at least 3 characters."),
    slug: optionalSlug,
    department: optionalText,
    sector: optionalText,
    location: optionalText,
    employmentType: z.enum([
      "full_time",
      "part_time",
      "contract",
      "internship",
    ]),
    workplaceType: z.enum(["remote", "hybrid", "onsite"]),
    experienceLevel: optionalText,
    education: optionalText,
    keywordsJson: z.string().optional(),
    description: z.string().optional(),
    contentSectionsJson: z.string().optional(),
    salaryMin: optionalAmount,
    salaryMax: optionalAmount,
    currency: optionalText,
    salaryPeriod: z.preprocess(
      (value) => (value === "" || value == null ? undefined : value),
      z.enum(["annual", "monthly"]).optional(),
    ),
    officeAddress: optionalText,
    officePhotosJson: z.string().optional(),
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
    applicationQuestionsJson: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    const hasDescription =
      (values.description ?? "").replace(/<[^>]*>/g, "").trim().length >= 10;
    const hasSections =
      parseJobContentSections(values.contentSectionsJson).length > 0;
    if (!hasDescription && !hasSections) {
      ctx.addIssue({
        code: "custom",
        path: ["description"],
        message:
          "Add a description or fill in at least one section (requirements, responsibilities, or benefits).",
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
      keywords: parseKeywords(values.keywordsJson),
      // Column is NOT NULL; a sections-only job submits no description.
      description: values.description ?? "",
      contentSections,
      salaryMin: values.salaryMin,
      salaryMax: values.salaryMax,
      currency: values.currency,
      salaryPeriod: values.salaryPeriod,
      officeAddress: values.officeAddress,
      officePhotos: parseOfficePhotos(values.officePhotosJson),
      applicationConfig,
      boardConfig,
    };
  });

export const jobStatusSchema = z.enum(["draft", "open", "closed"]);

export type JobFormValues = z.infer<typeof jobFormSchema>;
export type JobStatus = z.infer<typeof jobStatusSchema>;
