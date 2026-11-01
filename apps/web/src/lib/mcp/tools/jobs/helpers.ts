import { z } from "zod";

import type { Job } from "@harly/db";

import {
  jobQuestionTypes,
  normalizeJobApplicationConfig,
  parseJobApplicationQuestions,
  parseJobContentSections,
  parseKeywords,
  parseOfficePhotos,
  type ApplicationFieldVisibility,
  type JobApplicationConfig,
  type JobApplicationQuestion,
  type JobBoardConfig,
  type JobContentSection,
} from "@/features/jobs/config";
import type { JobFormValues } from "@/features/jobs/validation";
import { EVALUATION_MODES, type EvaluationMode } from "@/lib/evaluation/mode";
import { McpToolError } from "../../types";

// Pure helpers for the jobs MCP tools: no database, no session. Everything
// that touches the app goes through the existing actions in ../jobs.ts.

// ---------------------------------------------------------------------------
// Input schemas shared by jobs_create / jobs_update
// ---------------------------------------------------------------------------

export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "internship"] as const;
export const WORKPLACE_TYPES = ["remote", "hybrid", "onsite"] as const;
export const JOB_STATUS_FILTERS = ["draft", "open", "closed"] as const;
export const HIRING_TEAM_ROLES = ["recruiter", "hiring_manager", "interviewer"] as const;
export const FIELD_VISIBILITY = ["required", "optional", "disabled"] as const;

/** Fields a recruiter edits on the job form. `null` clears the optional ones. */
export const jobFieldsShape = {
  slug: z
    .string()
    .trim()
    .max(120)
    .optional()
    .describe("URL slug. Omit to keep the current one (new jobs derive it from the title). Must stay stable once the job is public."),
  department: z.string().trim().max(120).nullable().optional().describe("Department name, e.g. Engineering. null clears it."),
  sector: z.string().trim().max(120).nullable().optional().describe("Industry / sector label. null clears it."),
  location: z.string().trim().max(200).nullable().optional().describe("Human location, e.g. 'Madrid, Spain'. null clears it."),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional().describe("Employment type."),
  workplaceType: z.enum(WORKPLACE_TYPES).optional().describe("Workplace type."),
  experienceLevel: z.string().trim().max(120).nullable().optional().describe("Seniority label, e.g. 'Senior'. null clears it."),
  education: z.string().trim().max(200).nullable().optional().describe("Education requirement label. null clears it."),
  evaluationMode: z
    .enum(EVALUATION_MODES)
    .optional()
    .describe("How strictly AI candidate matching treats missing requirements: relaxed, balanced (default) or strict."),
  keywords: z.array(z.string().trim().min(1).max(80)).max(30).optional().describe("Skill / matching keywords. Replaces the whole list."),
  description: z
    .string()
    .max(60_000)
    .optional()
    .describe("Main job description. Plain text (blank-line separated paragraphs) or HTML. Replaces the current description."),
  contentSections: z
    .array(
      z.object({
        title: z.string().trim().max(120).describe("Section heading, e.g. Requirements."),
        body: z.string().max(30_000).describe("Section body, plain text or HTML (lists allowed)."),
      }),
    )
    .max(20)
    .optional()
    .describe("Extra description blocks (responsibilities, requirements, benefits...). Replaces all existing blocks."),
  salaryMin: z.number().int().nonnegative().nullable().optional().describe("Minimum salary in whole currency units. Needs currency and salaryPeriod. null clears."),
  salaryMax: z.number().int().nonnegative().nullable().optional().describe("Maximum salary in whole currency units. null clears."),
  currency: z.string().trim().length(3).nullable().optional().describe("ISO 4217 currency code, e.g. EUR. Required when a salary is set."),
  salaryPeriod: z.enum(["annual", "monthly"]).nullable().optional().describe("Pay period. Required when a salary is set."),
  officeAddress: z.string().trim().max(300).nullable().optional().describe("Office address for onsite/hybrid roles. null clears."),
  jobLocationCountry: z.string().trim().length(2).nullable().optional().describe("ISO 3166-1 alpha-2 country, e.g. ES. null clears."),
  jobLocationRegion: z.string().trim().max(120).nullable().optional().describe("Region / state, used for region-scoped roles. null clears."),
  remoteEligibleCountries: z
    .array(z.string().trim().length(2))
    .max(100)
    .optional()
    .describe("ISO alpha-2 countries remote candidates may apply from. Replaces the list."),
  validThrough: z.iso.datetime({ offset: true }).nullable().optional().describe("ISO date-time after which the public posting expires. null clears."),
} as const;

export const jobFieldsObject = z.object(jobFieldsShape);
export type JobFieldsPatch = z.infer<typeof jobFieldsObject> & { title?: string };

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** Plain text becomes paragraphs; anything that already looks like HTML is kept. */
export function textToHtml(value: string): string {
  const text = value.trim();
  if (!text) return "";
  if (/<\/?[a-z][\s\S]*>/i.test(text)) return text;
  return text
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block.trim()).replaceAll("\n", "<br>")}</p>`)
    .join("");
}

export function stripHtml(value: string): string {
  return value
    .replace(/<\/(p|li|h[1-6]|div|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** AI draft ({summary, sections}) to the HTML the job editor stores. */
export function draftToHtml(draft: {
  summary: string;
  sections: Array<{ title: string; bullets: string[] }>;
}): string {
  const sections = draft.sections.map(
    (section) =>
      `<h2>${escapeHtml(section.title)}</h2><ul>${section.bullets
        .map((bullet) => `<li>${escapeHtml(bullet)}</li>`)
        .join("")}</ul>`,
  );
  return `<p>${escapeHtml(draft.summary)}</p>${sections.join("")}`;
}

// ---------------------------------------------------------------------------
// Job <-> form values
// ---------------------------------------------------------------------------

const CLEARABLE_KEYS = [
  "department",
  "sector",
  "location",
  "experienceLevel",
  "education",
  "salaryMin",
  "salaryMax",
  "currency",
  "salaryPeriod",
  "officeAddress",
  "jobLocationCountry",
  "jobLocationRegion",
  "validThrough",
] as const;

function legacyAwareSections(job: Pick<Job, "contentSections" | "requirements" | "benefits">): JobContentSection[] {
  const existing = parseJobContentSections(job.contentSections);
  if (existing.length > 0) return existing;
  // updateJob() nulls the legacy columns, so fold them into sections first
  // (the edit form does the same) or the text would be lost on save.
  const migrated: JobContentSection[] = [];
  if (job.requirements) migrated.push({ id: "migrated-req", title: "Requirements", body: job.requirements });
  if (job.benefits) migrated.push({ id: "migrated-ben", title: "Benefits", body: job.benefits });
  return migrated;
}

/** Current persisted job as the full value set `updateJob` rewrites. */
export function jobToFormValues(job: Job): JobFormValues {
  return {
    title: job.title,
    slug: job.slug,
    department: job.department ?? undefined,
    sector: job.sector ?? undefined,
    location: job.location ?? undefined,
    employmentType: job.employmentType,
    workplaceType: job.workplaceType,
    experienceLevel: job.experienceLevel ?? undefined,
    education: job.education ?? undefined,
    evaluationMode: (EVALUATION_MODES as readonly string[]).includes(job.evaluationMode)
      ? (job.evaluationMode as EvaluationMode)
      : "balanced",
    keywords: parseKeywords(job.keywords),
    description: job.description,
    contentSections: legacyAwareSections(job),
    salaryMin: job.salaryMin ?? undefined,
    salaryMax: job.salaryMax ?? undefined,
    currency: job.currency ?? undefined,
    salaryPeriod: job.salaryPeriod === "annual" || job.salaryPeriod === "monthly" ? job.salaryPeriod : undefined,
    officeAddress: job.officeAddress ?? undefined,
    jobLocationCountry: job.jobLocationCountry ?? undefined,
    jobLocationRegion: job.jobLocationRegion ?? undefined,
    remoteEligibleCountries: Array.isArray(job.remoteEligibleCountries)
      ? (job.remoteEligibleCountries as unknown[]).filter((c): c is string => typeof c === "string")
      : [],
    validThrough: job.validThrough ?? undefined,
    officePhotos: parseOfficePhotos(job.officePhotos),
    applicationConfig: normalizeJobApplicationConfig(job.applicationConfig),
    boardConfig: (job.boardConfig ?? {}) as JobBoardConfig,
  };
}

/** Values for a brand-new job: the form defaults plus whatever the caller set. */
export function newJobBase(title: string): JobFormValues {
  return {
    title,
    slug: undefined,
    department: undefined,
    sector: undefined,
    location: undefined,
    employmentType: "full_time",
    workplaceType: "onsite",
    experienceLevel: undefined,
    education: undefined,
    evaluationMode: "balanced",
    keywords: [],
    description: "",
    contentSections: [],
    salaryMin: undefined,
    salaryMax: undefined,
    currency: undefined,
    salaryPeriod: undefined,
    officeAddress: undefined,
    jobLocationCountry: undefined,
    jobLocationRegion: undefined,
    remoteEligibleCountries: [],
    validThrough: undefined,
    officePhotos: [],
    applicationConfig: normalizeJobApplicationConfig({}),
    boardConfig: {},
  };
}

function toSections(
  sections: Array<{ title: string; body: string }>,
): JobContentSection[] {
  return parseJobContentSections(
    sections.map((section) => ({ title: section.title, body: textToHtml(section.body) })),
  );
}

/**
 * Apply a partial edit. `null` on a clearable field really clears it: the
 * returned object carries `null` there (updateJob skips `undefined` columns,
 * so clearing needs an explicit null).
 */
export function mergeJobValues(base: JobFormValues, patch: JobFieldsPatch): JobFormValues {
  const next: Record<string, unknown> = { ...base };

  if (patch.title !== undefined) next.title = patch.title.trim();
  if (patch.slug !== undefined) next.slug = patch.slug.trim() || undefined;
  if (patch.employmentType !== undefined) next.employmentType = patch.employmentType;
  if (patch.workplaceType !== undefined) next.workplaceType = patch.workplaceType;
  if (patch.evaluationMode !== undefined) next.evaluationMode = patch.evaluationMode;
  if (patch.keywords !== undefined) next.keywords = parseKeywords(patch.keywords);
  if (patch.description !== undefined) next.description = textToHtml(patch.description);
  if (patch.contentSections !== undefined) next.contentSections = toSections(patch.contentSections);
  if (patch.remoteEligibleCountries !== undefined) {
    next.remoteEligibleCountries = Array.from(
      new Set(patch.remoteEligibleCountries.map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c))),
    );
  }

  for (const key of CLEARABLE_KEYS) {
    const value = patch[key];
    if (value === undefined) continue;
    if (value === null) {
      next[key] = null;
      continue;
    }
    if (key === "validThrough") next[key] = new Date(value as string);
    else if (key === "currency" || key === "jobLocationCountry") next[key] = (value as string).toUpperCase();
    else next[key] = value;
  }

  return next as JobFormValues;
}

/** Same rules as the web form (`jobFormSchema` superRefine). Returns messages. */
export function validateJobValues(values: JobFormValues): string[] {
  const issues: string[] = [];
  if (!values.title || values.title.trim().length < 3) issues.push("Title must be at least 3 characters.");

  const plain = stripHtml(values.description ?? "");
  const hasDescription = plain.length >= 10;
  const hasSections = values.contentSections.length > 0;
  if (!hasDescription && !hasSections) {
    issues.push("Add a description (at least 10 characters) or at least one content section.");
  }

  const min = values.salaryMin ?? null;
  const max = values.salaryMax ?? null;
  if (min !== null && max !== null && min > max) issues.push("salaryMax must be greater than or equal to salaryMin.");
  if ((min !== null || max !== null) && !values.currency) issues.push("currency is required when a salary is set.");
  if ((min !== null || max !== null) && !values.salaryPeriod) issues.push("salaryPeriod is required when a salary is set.");
  return issues;
}

export function assertValidJobValues(values: JobFormValues): void {
  const issues = validateJobValues(values);
  if (issues.length > 0) throw new McpToolError(issues.join(" "), "invalid_input");
}

// ---------------------------------------------------------------------------
// Application form
// ---------------------------------------------------------------------------

export const questionInputSchema = z.object({
  id: z.string().trim().max(80).optional().describe("Stable key. Omit to derive it from the label; reuse an existing id to keep answers linked."),
  label: z.string().trim().min(1).max(160).describe("Question text shown to the candidate."),
  type: z
    .enum(jobQuestionTypes)
    .default("text")
    .describe("text (short), textarea (long), url, select (needs options), info (read-only note, needs description) or consent (agreement, needs description)."),
  required: z.boolean().default(false).describe("Candidate must answer."),
  minLength: z.number().int().min(0).max(5000).optional().describe("Minimum answer length for text/textarea."),
  placeholder: z.string().trim().max(200).optional().describe("Placeholder hint."),
  options: z.array(z.string().trim().min(1).max(120)).max(20).optional().describe("Choices for select questions."),
  optionDescriptions: z.array(z.string().trim().max(500)).max(20).optional().describe("Optional helper text per select option, same order."),
  description: z.string().trim().max(8000).optional().describe("Body for info and consent blocks."),
  agreeLabel: z.string().trim().max(120).optional().describe("Consent: label of the agree choice."),
  disagreeLabel: z.string().trim().max(120).optional().describe("Consent: label of the disagree choice."),
});
export type QuestionInput = z.infer<typeof questionInputSchema>;

export const MAX_APPLICATION_QUESTIONS = 10;

/** Validate and normalise screening questions with the app's own parser. */
export function buildQuestions(inputs: QuestionInput[]): JobApplicationQuestion[] {
  if (inputs.length > MAX_APPLICATION_QUESTIONS) {
    throw new McpToolError(`A job can have at most ${MAX_APPLICATION_QUESTIONS} application questions.`, "invalid_input");
  }
  const parsed: JobApplicationQuestion[] = [];
  for (const input of inputs) {
    const [question] = parseJobApplicationQuestions(JSON.stringify([input]));
    if (!question) {
      throw new McpToolError(
        `Question "${input.label}" is invalid: select questions need at least one option, and info and consent blocks need a description.`,
        "invalid_input",
      );
    }
    parsed.push(question);
  }
  const ids = new Set<string>();
  for (const question of parsed) {
    if (ids.has(question.id)) {
      throw new McpToolError(
        `Two questions resolve to the same id "${question.id}". Give them different labels or explicit ids.`,
        "invalid_input",
      );
    }
    ids.add(question.id);
  }
  return parsed;
}

export const applicationFieldKeys = [
  "phone",
  "address",
  "photo",
  "headline",
  "resume",
  "linkedinUrl",
  "githubUrl",
  "websiteUrl",
  "education",
  "experience",
  "coverLetter",
] as const;
export type ApplicationFieldKey = (typeof applicationFieldKeys)[number];

export type ApplicationFormPatch = {
  fields?: Partial<Record<ApplicationFieldKey, ApplicationFieldVisibility>>;
  questions?: JobApplicationQuestion[];
};

function linkSetting(visibility: ApplicationFieldVisibility) {
  return { enabled: visibility !== "disabled", required: visibility === "required" };
}

/** Recompute the derived flags exactly like jobFormSchema's transform does. */
export function applyApplicationFormPatch(
  config: JobApplicationConfig,
  patch: ApplicationFormPatch,
): JobApplicationConfig {
  const sections = structuredClone(config.sections);
  const set = (key: ApplicationFieldKey, visibility: ApplicationFieldVisibility) => {
    switch (key) {
      case "phone":
      case "address":
      case "photo":
      case "headline":
        sections.personal[key].visibility = visibility;
        break;
      case "resume":
      case "linkedinUrl":
      case "githubUrl":
      case "websiteUrl":
      case "education":
      case "experience":
        sections.profile[key].visibility = visibility;
        break;
      case "coverLetter":
        sections.details.coverLetter.visibility = visibility;
        break;
    }
  };
  for (const [key, visibility] of Object.entries(patch.fields ?? {}) as Array<
    [ApplicationFieldKey, ApplicationFieldVisibility | undefined]
  >) {
    if (visibility) set(key, visibility);
  }
  return {
    resumeRequired: sections.profile.resume.visibility === "required",
    profileLinks: {
      linkedin: linkSetting(sections.profile.linkedinUrl.visibility),
      github: linkSetting(sections.profile.githubUrl.visibility),
      website: linkSetting(sections.profile.websiteUrl.visibility),
    },
    sections,
    questions: patch.questions ?? config.questions,
  };
}

export function serializeApplicationForm(config: JobApplicationConfig) {
  return {
    fields: {
      phone: config.sections.personal.phone.visibility,
      address: config.sections.personal.address.visibility,
      photo: config.sections.personal.photo.visibility,
      headline: config.sections.personal.headline.visibility,
      resume: config.sections.profile.resume.visibility,
      linkedinUrl: config.sections.profile.linkedinUrl.visibility,
      githubUrl: config.sections.profile.githubUrl.visibility,
      websiteUrl: config.sections.profile.websiteUrl.visibility,
      education: config.sections.profile.education.visibility,
      experience: config.sections.profile.experience.visibility,
      coverLetter: config.sections.details.coverLetter.visibility,
    },
    questions: config.questions.map((question) => ({
      id: question.id,
      label: question.label,
      type: question.type,
      required: question.required,
      minLength: question.minLength ?? null,
      placeholder: question.placeholder ?? null,
      options: question.options ? [...question.options] : null,
      description: question.description ?? null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Serialisation, urls, risk
// ---------------------------------------------------------------------------

export function dashboardJobUrl(origin: string, jobId: string): string {
  return `${origin}/dashboard/jobs/${jobId}`;
}

export function boardUrl(origin: string, workspaceSlug: string): string {
  return `${origin}/board/${workspaceSlug}`;
}

/** Mirrors `publicJobVisibilityConditions`. */
export function isPubliclyVisible(
  job: Pick<Job, "status" | "deletedAt" | "publishedAt" | "validThrough">,
  now = new Date(),
): boolean {
  return (
    job.status === "open" &&
    !job.deletedAt &&
    (!job.publishedAt || job.publishedAt <= now) &&
    (!job.validThrough || job.validThrough >= now)
  );
}

export function publicJobLinks(
  origin: string,
  workspaceSlug: string,
  job: Pick<Job, "slug" | "status" | "deletedAt" | "publishedAt" | "validThrough">,
  now = new Date(),
) {
  const visible = isPubliclyVisible(job, now);
  return {
    publiclyVisible: visible,
    publicUrl: visible ? `${boardUrl(origin, workspaceSlug)}/jobs/${job.slug}` : null,
    applyUrl: visible ? `${boardUrl(origin, workspaceSlug)}/apply/${job.slug}` : null,
  };
}

const iso = (value: Date | null | undefined) => (value ? value.toISOString() : null);

export type JobListRow = {
  id: string;
  title: string;
  slug: string;
  department: string | null;
  location: string | null;
  employmentType: string;
  workplaceType: string;
  status: "draft" | "open" | "closed";
  publishedAt: Date | null;
  createdAt: Date;
  deletedAt?: Date | null;
  applicants: number;
  activeApplicants: number;
  newApplicants: number;
  lastAppliedAt: Date | string | null;
};

const DAY_MS = 86_400_000;

/** Why an open job needs attention, or null. Same thresholds as the dashboard widget. */
export function jobRisk(
  row: Pick<JobListRow, "status" | "applicants" | "lastAppliedAt" | "publishedAt" | "createdAt">,
  now = new Date(),
): { reason: string; severity: "critical" | "danger" } | null {
  if (row.status !== "open") return null;
  const lastApplied = row.lastAppliedAt ? new Date(row.lastAppliedAt).getTime() : null;
  const sinceApplied = lastApplied === null ? Infinity : (now.getTime() - lastApplied) / DAY_MS;
  const sincePublished = (now.getTime() - (row.publishedAt ?? row.createdAt).getTime()) / DAY_MS;
  // A role that has been live for less than a week simply has not had time yet.
  if (sinceApplied >= 7 && sincePublished >= 7) {
    return row.applicants === 0
      ? { reason: "No applications yet", severity: "critical" }
      : { reason: "No applications in 7 days", severity: "danger" };
  }
  return null;
}

export function serializeJobListRow(
  row: JobListRow,
  ctx: { origin: string; workspaceSlug: string },
  now = new Date(),
) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    status: row.status,
    department: row.department,
    location: row.location,
    employmentType: row.employmentType,
    workplaceType: row.workplaceType,
    applicants: row.applicants,
    activeApplicants: row.activeApplicants,
    newThisWeek: row.newApplicants,
    lastApplicationAt: row.lastAppliedAt ? new Date(row.lastAppliedAt).toISOString() : null,
    risk: jobRisk(row, now),
    publishedAt: iso(row.publishedAt),
    createdAt: row.createdAt.toISOString(),
    deletedAt: iso(row.deletedAt),
    url: dashboardJobUrl(ctx.origin, row.id),
    publicUrl: publicJobLinks(ctx.origin, ctx.workspaceSlug, {
      slug: row.slug,
      status: row.status,
      deletedAt: row.deletedAt ?? null,
      publishedAt: row.publishedAt,
      validThrough: null,
    }, now).publicUrl,
  };
}

export function serializeJobDetail(
  job: Job,
  ctx: { origin: string; workspaceSlug: string },
  now = new Date(),
) {
  const sections = legacyAwareSections(job);
  const links = publicJobLinks(ctx.origin, ctx.workspaceSlug, job, now);
  const hasSalary = job.salaryMin !== null || job.salaryMax !== null;
  return {
    id: job.id,
    title: job.title,
    slug: job.slug,
    status: job.status,
    department: job.department,
    sector: job.sector,
    location: job.location,
    employmentType: job.employmentType,
    workplaceType: job.workplaceType,
    experienceLevel: job.experienceLevel,
    education: job.education,
    evaluationMode: job.evaluationMode,
    keywords: parseKeywords(job.keywords),
    salary: hasSalary
      ? { min: job.salaryMin, max: job.salaryMax, currency: job.currency, period: job.salaryPeriod }
      : null,
    officeAddress: job.officeAddress,
    jobLocationCountry: job.jobLocationCountry,
    jobLocationRegion: job.jobLocationRegion,
    remoteEligibleCountries: Array.isArray(job.remoteEligibleCountries) ? job.remoteEligibleCountries : [],
    validThrough: iso(job.validThrough),
    publishedAt: iso(job.publishedAt),
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    description: job.description,
    contentSections: sections.map((section) => ({ title: section.title, body: section.body })),
    url: dashboardJobUrl(ctx.origin, job.id),
    ...links,
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

function digestOf(error: unknown): string {
  return typeof error === "object" && error !== null && "digest" in error && typeof error.digest === "string"
    ? error.digest
    : "";
}

/** Classify a plain failure message from the existing actions. */
export function classifyFailure(message: string): McpToolError["code"] {
  if (/do(es)? not have (permission|access)|not assigned to this job|only assigned approver|cannot approve own/i.test(message)) {
    return "forbidden";
  }
  if (/not found|no longer available/i.test(message)) return "not_found";
  if (/pending approval|already decided|only draft|already exists|has applications/i.test(message)) return "conflict";
  return "invalid_input";
}

/**
 * Turn what the existing server actions throw into an McpToolError. Anything
 * unrecognised is rethrown so the runtime reports it as an internal error.
 */
export function mapActionError(error: unknown): never {
  if (error instanceof McpToolError) throw error;
  const digest = digestOf(error);
  if (digest.includes("NEXT_HTTP_ERROR_FALLBACK;404") || digest === "NEXT_NOT_FOUND") {
    throw new McpToolError("Job not found.", "not_found");
  }
  if (digest.startsWith("NEXT_")) throw error;
  if (error instanceof Error) {
    const code = classifyFailure(error.message);
    const recognised =
      code !== "invalid_input" ||
      /must|invalid|cannot|required|only|at least|too long|member of this workspace/i.test(error.message);
    if (recognised) throw new McpToolError(error.message, code);
  }
  throw error;
}

/** `{ success: false, error }` results from the actions become tool errors. */
export function failure(message: string | undefined, fallback: string): never {
  const text = message?.trim() || fallback;
  throw new McpToolError(text, classifyFailure(text));
}

export function clampLimit(limit: number | undefined, fallback = 25, max = 100): number {
  return Math.min(Math.max(Math.trunc(limit ?? fallback), 1), max);
}
