import { z } from "zod";

// Shared primitives

export const maxResumeFileSize = 10 * 1024 * 1024;
export const maxImageFileSize = 5 * 1024 * 1024;

export const allowedResumeContentTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const allowedImageContentTypes = [
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "image/webp",
] as const;

export const optionalTrimmedString = z
  .unknown()
  .transform((value) => (typeof value === "string" ? value.trim() : ""))
  .transform((value) => (value.length > 0 ? value : undefined));

export const optionalHttpsUrlSchema = optionalTrimmedString.refine(
  (value) => !value || (URL.canParse(value) && value.startsWith("https://")),
  "URL must use HTTPS.",
);

export const optionalNonNegativeIntSchema = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((value, ctx) => {
    if (value === null || value === undefined || value === "") return undefined;
    const number = typeof value === "number" ? value : Number(value);
    if (!Number.isInteger(number) || number < 0) {
      ctx.addIssue({ code: "custom", message: "Expected a non-negative integer." });
      return z.NEVER;
    }
    return number;
  });

export const resumeUploadRequestSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z.enum(allowedResumeContentTypes),
  contentLength: z.number().int().positive().max(maxResumeFileSize),
});

export const imageUploadRequestSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z.enum(allowedImageContentTypes),
  contentLength: z.number().int().positive().max(maxImageFileSize),
});

export const inviteEmailSchema = z.string().trim().toLowerCase().email();
export const invitationSchema = z.object({
  email: inviteEmailSchema,
  role: z.enum(["admin", "recruiter", "hiring_manager"]).default("recruiter"),
});

// Public API v1 request contracts

const employmentType = z.enum(["full_time", "part_time", "contract", "internship"]);
const workplaceType = z.enum(["remote", "hybrid", "onsite"]);
const jobStatus = z.enum(["draft", "open", "closed"]);
const nullableString = z.string().trim().max(20_000).nullish();
const nullableUuid = z.uuid().nullish();
const nullableIsoDateTime = z.iso.datetime().nullish();

const candidateEducationEntrySchema = z.object({
  id: z.string().trim().min(1).max(120),
  school: z.string().trim().min(1).max(500),
  degree: z.string().trim().max(20_000).nullable().default(null),
  field: z.string().trim().max(20_000).nullable().default(null),
  startDate: z.string().trim().max(20_000).nullable().default(null),
  endDate: z.string().trim().max(20_000).nullable().default(null),
  description: z.string().trim().max(20_000).nullable().default(null),
});

const candidateExperienceEntrySchema = z.object({
  id: z.string().trim().min(1).max(120),
  company: z.string().trim().min(1).max(500),
  title: z.string().trim().min(1).max(500),
  startDate: z.string().trim().max(20_000).nullable().default(null),
  endDate: z.string().trim().max(20_000).nullable().default(null),
  current: z.boolean().nullable().default(null),
  location: z.string().trim().max(20_000).nullable().default(null),
  description: z.string().trim().max(20_000).nullable().default(null),
});

export const jobCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(50_000),
  slug: z.string().trim().max(200).optional(),
  department: nullableString,
  location: nullableString,
  employmentType,
  workplaceType,
  status: jobStatus.optional(),
  requirements: nullableString,
  benefits: nullableString,
  keywords: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  salaryMin: z.number().int().nonnegative().nullish(),
  salaryMax: z.number().int().nonnegative().nullish(),
  currency: z.string().trim().max(8).nullish(),
  salaryPeriod: z.enum(["annual", "monthly"]).nullish(),
});
export const jobUpdateSchema = jobCreateSchema.partial();

export const candidateCreateSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(320),
  phone: nullableString,
  address: nullableString,
  location: nullableString,
  headline: nullableString,
  summary: nullableString,
  linkedinUrl: z.url().nullish(),
  githubUrl: z.url().nullish(),
  websiteUrl: z.url().nullish(),
  educationEntries: z.array(candidateEducationEntrySchema).max(100).nullish(),
  experienceEntries: z.array(candidateExperienceEntrySchema).max(100).nullish(),
});
export const candidateUpdateSchema = candidateCreateSchema.partial();

export const applicationCreateSchema = z.object({
  jobId: z.uuid(),
  candidateId: z.uuid(),
  source: z.string().trim().min(1).max(60).optional(),
});
export const applicationMoveSchema = z.object({ toStageId: z.uuid() });
export const applicationBulkCreateSchema = z.object({
  jobId: z.uuid(),
  candidateIds: z.array(z.uuid()).min(1).max(100),
  source: z.string().trim().min(1).max(60).optional(),
});

export const webhookCreateSchema = z.object({
  url: z.url(),
  events: z.array(z.string().trim().min(1).max(120)).min(1).max(100),
  description: nullableString,
});
export const webhookUpdateSchema = z.object({
  url: z.url().optional(),
  events: z.array(z.string().trim().min(1).max(120)).min(1).max(100).optional(),
  enabled: z.boolean().optional(),
  description: nullableString,
});
export const webhookDeliveryReplaySchema = z.object({}).strict();

export const apiKeyCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(["publishable", "secret"]),
  scopes: z.array(z.string().trim().min(1).max(120)).min(1).max(50),
  expiresInDays: z.number().int().positive().max(3650).nullish(),
});

export const candidateNoteCreateSchema = z.object({
  body: z.string().trim().min(1).max(5_000),
  mentions: z.array(z.object({ userId: z.string().trim().min(1).max(120) })).max(20).optional(),
});
export const candidateTagCreateSchema = z.object({
  label: z.string().trim().min(1).max(40),
});

export const candidateFileUploadIntentSchema = resumeUploadRequestSchema;
export const candidateFileConfirmSchema = z.object({
  key: z.string().trim().min(1).max(1_024),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
});

export const interviewCreateSchema = z.object({
  candidateId: z.uuid(),
  applicationId: z.uuid(),
  type: z.enum(["screening", "culture_fit", "technical", "onsite", "final"]),
  mode: z.enum(["video", "phone", "onsite"]),
  scheduledAt: z.iso.datetime(),
  durationMins: z.number().int().min(5).max(480).default(45),
  interviewerId: nullableString,
  title: nullableString,
  location: nullableString,
  notes: nullableString,
});
export const interviewUpdateSchema = interviewCreateSchema
  .partial()
  .omit({ applicationId: true, candidateId: true });

const offerFieldsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  salaryAmount: z.number().int().positive().max(100_000_000).nullable(),
  currency: z.string().trim().max(8).nullable(),
  salaryPeriod: z.enum(["annual", "monthly"]).nullable(),
  equity: z.string().trim().max(120).nullable(),
  startDate: nullableIsoDateTime,
  expiresAt: nullableIsoDateTime,
  notes: z.string().trim().max(5_000).nullable(),
});
export const offerCreateSchema = offerFieldsSchema.extend({ applicationId: z.uuid() });
export const offerUpdateSchema = offerFieldsSchema.partial();
export const offerDecisionSchema = z.object({
  decision: z.enum(["accepted", "declined"]),
});

export const scorecardCreateSchema = z.object({
  candidateId: z.uuid(),
  applicationId: nullableUuid,
  stageId: nullableUuid,
  stageName: nullableString,
  rating: z.enum(["strong", "mixed", "weak"]),
  comment: nullableString,
  criteria: z.array(z.object({ label: z.string().trim().min(1).max(200), score: z.number().finite().optional() })).max(50).optional(),
});
export const scorecardUpdateSchema = scorecardCreateSchema.partial().omit({ candidateId: true });

export const taskCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).nullish(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  status: z.enum(["pending", "in_progress", "completed", "canceled"]).default("pending"),
  dueDate: nullableIsoDateTime,
  ownerId: z.string().trim().min(1).max(120),
  candidateId: nullableUuid,
  applicationId: nullableUuid,
  jobId: nullableUuid,
  interviewId: nullableUuid,
});
export const taskUpdateSchema = taskCreateSchema.partial();

export const jobStageCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  color: z.string().trim().max(32).nullish(),
  order: z.number().int().nonnegative().optional(),
  emailConfig: z.record(z.string(), z.unknown()).optional(),
});
export const jobStageUpdateSchema = jobStageCreateSchema.partial();
export const jobStageReorderSchema = z.object({
  stageIds: z.array(z.uuid()).min(1).max(100),
});

export const poolEntryCreateSchema = z.object({
  candidateId: z.uuid(),
  jobId: nullableUuid,
  source: z.enum(["applied", "imported", "sourced", "referred"]).default("sourced"),
  reason: z.string().trim().max(500).nullish(),
});
