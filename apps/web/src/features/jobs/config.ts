import { z } from "zod";

import { slugify } from "@/lib/utils";

export const jobQuestionTypes = ["text", "textarea", "url", "select"] as const;

export type JobQuestionType = (typeof jobQuestionTypes)[number];

export type JobApplicationQuestion = {
  id: string;
  label: string;
  type: JobQuestionType;
  required: boolean;
  minLength?: number;
  placeholder?: string;
  options?: readonly string[];
};

/** Per-platform link setting: show it at all, and whether candidates must fill it. */
export type JobProfileLinkSetting = {
  enabled: boolean;
  required: boolean;
};

export type JobProfileLinks = {
  linkedin: JobProfileLinkSetting;
  github: JobProfileLinkSetting;
  website: JobProfileLinkSetting;
};

export const applicationFieldVisibilityValues = [
  "required",
  "optional",
  "disabled",
] as const;

export type ApplicationFieldVisibility =
  (typeof applicationFieldVisibilityValues)[number];

export type JobApplicationFieldConfig = {
  visibility: ApplicationFieldVisibility;
  label?: string;
  hint?: string;
};

export type JobApplicationSections = {
  personal: {
    phone: JobApplicationFieldConfig;
    address: JobApplicationFieldConfig;
    photo: JobApplicationFieldConfig;
    headline: JobApplicationFieldConfig;
  };
  profile: {
    resume: JobApplicationFieldConfig;
    linkedinUrl: JobApplicationFieldConfig;
    githubUrl: JobApplicationFieldConfig;
    websiteUrl: JobApplicationFieldConfig;
    education: JobApplicationFieldConfig;
    experience: JobApplicationFieldConfig;
  };
  details: {
    coverLetter: JobApplicationFieldConfig;
  };
};

export type JobApplicationConfig = {
  resumeRequired: boolean;
  /** Per-link visibility , each is independently optional for candidates. */
  profileLinks: JobProfileLinks;
  sections: JobApplicationSections;
  questions: JobApplicationQuestion[];
};

export type JobBoardConfig = {
  brandName?: string;
  accentColor?: string;
};

/** A recruiter-authored description block: free title + rich-text body. */
export type JobContentSection = {
  id: string;
  title: string;
  body: string;
};

const contentSectionSchema = z.object({
  id: z.string().trim().min(1).optional(),
  title: z.string().trim().max(120).default(""),
  body: z.string().default(""),
});

/** Parse the JSON blob from the form / DB into clean content sections. */
export function parseJobContentSections(
  value: unknown,
): JobContentSection[] {
  let raw: unknown = value;
  if (typeof value === "string") {
    if (!value.trim()) return [];
    try {
      raw = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((entry, index) => {
    const result = contentSectionSchema.safeParse(entry);
    if (!result.success) return [];
    const body = result.data.body.trim();
    const title = result.data.title.trim();
    if (!body && !title) return [];
    return [
      {
        id: result.data.id || `section-${index + 1}`,
        title,
        body: result.data.body,
      },
    ];
  });
}

/** Image URLs for the office gallery. */
export function parseOfficePhotos(value: unknown): string[] {
  let raw: unknown = value;
  if (typeof value === "string") {
    if (!value.trim()) return [];
    try {
      raw = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 8);
}

/** Keyword tags. */
export function parseKeywords(value: unknown): string[] {
  let raw: unknown = value;
  if (typeof value === "string") {
    if (!value.trim()) return [];
    try {
      const parsed: unknown = JSON.parse(value);
      raw = parsed;
    } catch {
      // Fall back to comma-separated input.
      raw = value.split(",");
    }
  }
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ).slice(0, 30);
}

const defaultLinkSetting: JobProfileLinkSetting = {
  enabled: true,
  required: false,
};

const optionalFieldSetting = (): JobApplicationFieldConfig => ({
  visibility: "optional",
});

const disabledFieldSetting = (): JobApplicationFieldConfig => ({
  visibility: "disabled",
});

export const defaultProfileLinks: JobProfileLinks = {
  linkedin: { ...defaultLinkSetting },
  github: { ...defaultLinkSetting },
  website: { ...defaultLinkSetting },
};

export const defaultJobApplicationSections: JobApplicationSections = {
  personal: {
    phone: optionalFieldSetting(),
    address: optionalFieldSetting(),
    photo: disabledFieldSetting(),
    headline: optionalFieldSetting(),
  },
  profile: {
    resume: { visibility: "required" },
    linkedinUrl: optionalFieldSetting(),
    githubUrl: optionalFieldSetting(),
    websiteUrl: optionalFieldSetting(),
    education: optionalFieldSetting(),
    experience: optionalFieldSetting(),
  },
  details: {
    coverLetter: optionalFieldSetting(),
  },
};

export const defaultJobApplicationConfig: JobApplicationConfig = {
  resumeRequired: true,
  profileLinks: { ...defaultProfileLinks },
  sections: defaultJobApplicationSections,
  questions: [],
};

/** True when at least one candidate link field is enabled. */
export function hasAnyProfileLink(links: JobProfileLinks) {
  return links.linkedin.enabled || links.github.enabled || links.website.enabled;
}

/** True when at least one enabled link is required from candidates. */
export function hasRequiredProfileLink(links: JobProfileLinks) {
  return links.linkedin.required || links.github.required || links.website.required;
}

export function isFieldEnabled(field: JobApplicationFieldConfig) {
  return field.visibility !== "disabled";
}

export function isFieldRequired(field: JobApplicationFieldConfig) {
  return field.visibility === "required";
}

export const defaultJobBoardConfig: JobBoardConfig = {
  accentColor: "#ff3f36",
};

const optionalTrimmed = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : undefined))
  .optional();

const questionSchema = z
  .object({
    id: z.string().trim().optional(),
    label: z.string().trim().min(1).max(160),
    type: z.enum(jobQuestionTypes).default("text"),
    required: z.boolean().default(false),
    minLength: z.coerce.number().int().min(0).max(5000).optional(),
    placeholder: optionalTrimmed,
    options: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  })
  .transform((question): JobApplicationQuestion => {
    const id = slugify(question.id || question.label || "question");

    return {
      id,
      label: question.label,
      type: question.type,
      required: question.required,
      minLength: question.minLength,
      placeholder: question.placeholder,
      options:
        question.type === "select"
          ? Array.from(new Set(question.options ?? []))
          : undefined,
    };
  })
  .refine(
    (question) =>
      question.type !== "select" ||
      Boolean(question.options && question.options.length > 0),
    "Select questions require at least one option.",
  );

// Accepts the new {enabled, required} shape or a legacy bare boolean
// (older configs stored just `linkedin: true`).
const linkSettingSchema = z.union([
  z.boolean().transform((enabled): JobProfileLinkSetting => ({ enabled, required: false })),
  z
    .object({
      enabled: z.boolean().default(true),
      required: z.boolean().default(false),
    })
    .transform((value): JobProfileLinkSetting => ({
      enabled: value.enabled,
      // A required link must also be shown.
      required: value.enabled && value.required,
    })),
]);

const profileLinksSchema = z.object({
  linkedin: linkSettingSchema.default({ ...defaultLinkSetting }),
  github: linkSettingSchema.default({ ...defaultLinkSetting }),
  website: linkSettingSchema.default({ ...defaultLinkSetting }),
});

const fieldConfigSchema = z.union([
  z.enum(applicationFieldVisibilityValues).transform(
    (visibility): JobApplicationFieldConfig => ({ visibility }),
  ),
  z
    .object({
      visibility: z.enum(applicationFieldVisibilityValues),
      label: optionalTrimmed,
      hint: optionalTrimmed,
    })
    .transform((value): JobApplicationFieldConfig => ({
      visibility: value.visibility,
      label: value.label,
      hint: value.hint,
    })),
]);

const sectionsSchema = z
  .object({
    personal: z
      .object({
        phone: fieldConfigSchema.default(optionalFieldSetting()),
        address: fieldConfigSchema.default(optionalFieldSetting()),
        photo: fieldConfigSchema.default(disabledFieldSetting()),
        headline: fieldConfigSchema.default(optionalFieldSetting()),
      })
      .default(defaultJobApplicationSections.personal),
    profile: z
      .object({
        resume: fieldConfigSchema.default({ visibility: "required" }),
        linkedinUrl: fieldConfigSchema.default(optionalFieldSetting()),
        githubUrl: fieldConfigSchema.default(optionalFieldSetting()),
        websiteUrl: fieldConfigSchema.default(optionalFieldSetting()),
        education: fieldConfigSchema.default(optionalFieldSetting()),
        experience: fieldConfigSchema.default(optionalFieldSetting()),
      })
      .default(defaultJobApplicationSections.profile),
    details: z
      .object({
        coverLetter: fieldConfigSchema.default(optionalFieldSetting()),
      })
      .default(defaultJobApplicationSections.details),
  })
  .transform((sections): JobApplicationSections => sections);

function visibilityToLinkSetting(
  field: JobApplicationFieldConfig,
): JobProfileLinkSetting {
  return {
    enabled: isFieldEnabled(field),
    required: isFieldRequired(field),
  };
}

function linkSettingToFieldConfig(
  setting: JobProfileLinkSetting,
): JobApplicationFieldConfig {
  return {
    visibility: setting.required
      ? "required"
      : setting.enabled
        ? "optional"
        : "disabled",
  };
}

const applicationConfigSchema = z
  .object({
    resumeRequired: z
      .boolean()
      .default(defaultJobApplicationConfig.resumeRequired),
    // New granular shape.
    profileLinks: profileLinksSchema.optional(),
    // Legacy single toggle , mapped to all three when present.
    profileLinksEnabled: z.boolean().optional(),
    sections: sectionsSchema.optional(),
    questions: z.array(questionSchema).max(10).default([]),
  })
  .transform((config): JobApplicationConfig => {
    const profileLinks: JobProfileLinks =
      config.profileLinks ??
      (config.profileLinksEnabled === undefined
        ? { ...defaultProfileLinks }
        : {
            linkedin: { enabled: config.profileLinksEnabled, required: false },
            github: { enabled: config.profileLinksEnabled, required: false },
            website: { enabled: config.profileLinksEnabled, required: false },
          });

    const sections: JobApplicationSections = config.sections ?? {
      ...defaultJobApplicationSections,
      personal: {
        ...defaultJobApplicationSections.personal,
      },
      profile: {
        ...defaultJobApplicationSections.profile,
        resume: {
          visibility: config.resumeRequired ? "required" : "optional",
        },
        linkedinUrl: linkSettingToFieldConfig(profileLinks.linkedin),
        githubUrl: linkSettingToFieldConfig(profileLinks.github),
        websiteUrl: linkSettingToFieldConfig(profileLinks.website),
        education: { ...defaultJobApplicationSections.profile.education },
        experience: { ...defaultJobApplicationSections.profile.experience },
      },
      details: {
        ...defaultJobApplicationSections.details,
      },
    };

    const derivedProfileLinks: JobProfileLinks = {
      linkedin: visibilityToLinkSetting(sections.profile.linkedinUrl),
      github: visibilityToLinkSetting(sections.profile.githubUrl),
      website: visibilityToLinkSetting(sections.profile.websiteUrl),
    };

    return {
      resumeRequired: isFieldRequired(sections.profile.resume),
      profileLinks: derivedProfileLinks,
      sections,
      questions: config.questions,
    };
  });

const boardConfigSchema = z.object({
  brandName: optionalTrimmed,
  accentColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export function parseJobApplicationQuestions(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    const rawQuestions = Array.isArray(parsed) ? parsed.slice(0, 10) : [];

    return rawQuestions.flatMap((question) => {
      const result = questionSchema.safeParse(question);
      return result.success ? [result.data] : [];
    });
  } catch {
    return [];
  }
}

export function normalizeJobApplicationConfig(
  value: unknown,
): JobApplicationConfig {
  const result = applicationConfigSchema.safeParse(value);
  return result.success ? result.data : defaultJobApplicationConfig;
}

export function normalizeJobBoardConfig(value: unknown): JobBoardConfig {
  const result = boardConfigSchema.safeParse(value);
  return result.success ? result.data : defaultJobBoardConfig;
}
