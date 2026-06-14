import { z } from "zod";

/** Zod request schemas for the authenticated REST API. */

const employmentType = z.enum([
  "full_time",
  "part_time",
  "contract",
  "internship",
]);
const workplaceType = z.enum(["remote", "hybrid", "onsite"]);
const jobStatus = z.enum(["draft", "open", "closed"]);

const nullableString = z.string().trim().max(20_000).nullish();

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
  keywords: z.array(z.string().trim().min(1)).max(50).optional(),
  salaryMin: z.number().int().nonnegative().nullish(),
  salaryMax: z.number().int().nonnegative().nullish(),
  currency: z.string().trim().max(8).nullish(),
  salaryPeriod: z.enum(["annual", "monthly"]).nullish(),
});

export const jobUpdateSchema = jobCreateSchema.partial();

export const candidateCreateSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  email: z.email().max(320),
  phone: nullableString,
  location: nullableString,
  headline: nullableString,
  linkedinUrl: z.url().nullish(),
  githubUrl: z.url().nullish(),
  websiteUrl: z.url().nullish(),
});

export const candidateUpdateSchema = candidateCreateSchema.partial();

export const applicationCreateSchema = z.object({
  jobId: z.uuid(),
  candidateId: z.uuid(),
  source: z.string().trim().max(60).optional(),
});

export const applicationMoveSchema = z.object({
  toStageId: z.uuid(),
});

export const webhookCreateSchema = z.object({
  url: z.url(),
  events: z.array(z.string().trim().min(1)).min(1),
  description: nullableString,
});

export const webhookUpdateSchema = z.object({
  url: z.url().optional(),
  events: z.array(z.string().trim().min(1)).min(1).optional(),
  enabled: z.boolean().optional(),
  description: nullableString,
});

export const apiKeyCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(["publishable", "secret"]),
  scopes: z.array(z.string().trim().min(1)).min(1),
  expiresInDays: z.number().int().positive().max(3650).nullish(),
});
