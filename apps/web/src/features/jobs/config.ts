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

export type JobProfileLinks = {
  linkedin: boolean;
  github: boolean;
  website: boolean;
};

export type JobApplicationConfig = {
  resumeRequired: boolean;
  /** Per-link visibility — each is independently optional for candidates. */
  profileLinks: JobProfileLinks;
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

export const defaultProfileLinks: JobProfileLinks = {
  linkedin: true,
  github: true,
  website: true,
};

export const defaultJobApplicationConfig: JobApplicationConfig = {
  resumeRequired: true,
  profileLinks: { ...defaultProfileLinks },
  questions: [],
};

/** True when at least one candidate link field is enabled. */
export function hasAnyProfileLink(links: JobProfileLinks) {
  return links.linkedin || links.github || links.website;
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

const profileLinksSchema = z.object({
  linkedin: z.boolean().default(true),
  github: z.boolean().default(true),
  website: z.boolean().default(true),
});

const applicationConfigSchema = z
  .object({
    resumeRequired: z
      .boolean()
      .default(defaultJobApplicationConfig.resumeRequired),
    // New granular shape.
    profileLinks: profileLinksSchema.optional(),
    // Legacy single toggle — mapped to all three when present.
    profileLinksEnabled: z.boolean().optional(),
    questions: z.array(questionSchema).max(10).default([]),
  })
  .transform((config): JobApplicationConfig => {
    const profileLinks: JobProfileLinks =
      config.profileLinks ??
      (config.profileLinksEnabled === undefined
        ? { ...defaultProfileLinks }
        : {
            linkedin: config.profileLinksEnabled,
            github: config.profileLinksEnabled,
            website: config.profileLinksEnabled,
          });

    return {
      resumeRequired: config.resumeRequired,
      profileLinks,
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
