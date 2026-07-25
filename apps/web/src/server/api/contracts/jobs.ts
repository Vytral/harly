import { z } from "zod";
import {
  jobCreateSchema,
  jobStageUpdateSchema,
  jobUpdateSchema,
} from "@harly/validators";

import { defineContract } from "./core";
import { errorEnvelopeSchema, successEnvelopeSchema } from "./types";

const jobSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  slug: z.string(),
  status: z.enum(["draft", "open", "closed"]),
  department: z.string().nullable(),
  location: z.string().nullable(),
  employmentType: z.string(),
  workplaceType: z.string(),
  description: z.string(),
  requirements: z.string().nullable(),
  benefits: z.string().nullable(),
  keywords: z.array(z.string()),
  salaryMin: z.number().nullable(),
  salaryMax: z.number().nullable(),
  currency: z.string().nullable(),
  salaryPeriod: z.string().nullable(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const jobStageSchema = z.object({
  id: z.string().uuid(),
  jobId: z.string().uuid(),
  name: z.string(),
  color: z.string().nullable(),
  order: z.number(),
  emailConfig: z.object({ candidateUpdatesEnabled: z.boolean() }),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const idPath = z.object({ id: z.string().uuid() });
const stagePath = z.object({
  id: z.string().uuid(),
  stageId: z.string().uuid(),
});
const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
  status: z.enum(["draft", "open", "closed"]).optional(),
});

export const listJobsContract = defineContract({
  method: "GET",
  path: "/api/v1/jobs",
  operationId: "listJobs",
  summary: "List jobs",
  description: "Retrieve a cursor-paginated list of jobs for the workspace.",
  tags: ["Jobs"],
  auth: { scopes: ["jobs:read"] },
  parameters: { query: listQuery },
  responses: {
    200: successEnvelopeSchema(z.array(jobSchema)),
    400: errorEnvelopeSchema,
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    429: errorEnvelopeSchema,
  },
});
export const createJobContract = defineContract({
  method: "POST",
  path: "/api/v1/jobs",
  operationId: "createJob",
  summary: "Create job",
  description: "Create a new job posting in the workspace.",
  tags: ["Jobs"],
  auth: { scopes: ["jobs:write"] },
  idempotent: true,
  requestBody: jobCreateSchema,
  responses: {
    201: successEnvelopeSchema(jobSchema),
    400: errorEnvelopeSchema,
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    409: errorEnvelopeSchema,
    422: errorEnvelopeSchema,
    429: errorEnvelopeSchema,
  },
});
export const getJobContract = defineContract({
  method: "GET",
  path: "/api/v1/jobs/{id}",
  operationId: "getJob",
  summary: "Get job",
  description: "Retrieve details of a single job by its ID.",
  tags: ["Jobs"],
  auth: { scopes: ["jobs:read"] },
  parameters: { path: idPath },
  responses: {
    200: successEnvelopeSchema(jobSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
    429: errorEnvelopeSchema,
  },
});
export const updateJobContract = defineContract({
  method: "PATCH",
  path: "/api/v1/jobs/{id}",
  operationId: "updateJob",
  summary: "Update job",
  description: "Update fields of an existing job.",
  tags: ["Jobs"],
  auth: { scopes: ["jobs:write"] },
  parameters: { path: idPath },
  requestBody: jobUpdateSchema,
  responses: {
    200: successEnvelopeSchema(jobSchema),
    400: errorEnvelopeSchema,
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
    422: errorEnvelopeSchema,
    429: errorEnvelopeSchema,
  },
});
export const deleteJobContract = defineContract({
  method: "DELETE",
  path: "/api/v1/jobs/{id}",
  operationId: "deleteJob",
  summary: "Delete job",
  description: "Soft-delete a job. Reverts its status to closed.",
  tags: ["Jobs"],
  auth: { scopes: ["jobs:write"] },
  parameters: { path: idPath },
  responses: {
    200: successEnvelopeSchema(z.object({ success: z.boolean() })),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
    429: errorEnvelopeSchema,
  },
});
export const publishJobContract = defineContract({
  method: "POST",
  path: "/api/v1/jobs/{id}/publish",
  operationId: "publishJob",
  summary: "Publish job",
  description: "Set job status to open and set publishedAt timestamp.",
  tags: ["Jobs"],
  auth: { scopes: ["jobs:write"] },
  idempotent: true,
  parameters: { path: idPath },
  responses: {
    200: successEnvelopeSchema(jobSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
    429: errorEnvelopeSchema,
  },
});
export const closeJobContract = defineContract({
  method: "POST",
  path: "/api/v1/jobs/{id}/close",
  operationId: "closeJob",
  summary: "Close job",
  description: "Set job status to closed.",
  tags: ["Jobs"],
  auth: { scopes: ["jobs:write"] },
  idempotent: true,
  parameters: { path: idPath },
  responses: {
    200: successEnvelopeSchema(jobSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
    429: errorEnvelopeSchema,
  },
});
export const listJobStagesContract = defineContract({
  method: "GET",
  path: "/api/v1/jobs/{id}/stages",
  operationId: "listJobStages",
  summary: "List job stages",
  description: "List the ordered pipeline stages for a job.",
  tags: ["Jobs", "Pipeline"],
  auth: { scopes: ["stages:read"] },
  parameters: { path: idPath },
  responses: {
    200: successEnvelopeSchema(z.array(jobStageSchema)),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
  },
});
export const updateJobStageContract = defineContract({
  method: "PATCH",
  path: "/api/v1/jobs/{id}/stages/{stageId}",
  operationId: "updateJobStage",
  summary: "Update job stage",
  description: "Edit a single pipeline stage in a job.",
  tags: ["Jobs", "Pipeline"],
  auth: { scopes: ["stages:write"] },
  parameters: { path: stagePath },
  requestBody: jobStageUpdateSchema,
  responses: {
    200: successEnvelopeSchema(jobStageSchema),
    400: errorEnvelopeSchema,
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
    422: errorEnvelopeSchema,
  },
});

export const jobsContracts = [
  listJobsContract,
  createJobContract,
  getJobContract,
  updateJobContract,
  deleteJobContract,
  publishJobContract,
  closeJobContract,
  listJobStagesContract,
  updateJobStageContract,
] as const;
