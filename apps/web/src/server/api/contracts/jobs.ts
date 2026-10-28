import { z } from "zod";
import {
  jobCreateSchema,
  jobStageArchiveSchema,
  jobStageCreateSchema,
  jobStageKindSchema,
  jobStageReorderSchema,
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
  /** Effective kind: legacy rows without a stored kind are classified by name. */
  kind: jobStageKindSchema,
  archivedAt: z.string().nullable(),
  emailConfig: z.object({ candidateUpdatesEnabled: z.boolean() }),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const stageListQuery = z.object({
  includeArchived: z.enum(["true", "false"]).optional(),
});
const jobStageArchiveResultSchema = z.object({
  stage: jobStageSchema,
  movedApplications: z.number().int().nonnegative(),
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
  description:
    "List the ordered pipeline stages for a job. Archived stages are omitted unless `includeArchived=true`.",
  tags: ["Jobs", "Pipeline"],
  auth: { scopes: ["stages:read"] },
  parameters: { path: idPath, query: stageListQuery },
  responses: {
    200: successEnvelopeSchema(z.array(jobStageSchema)),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
    429: errorEnvelopeSchema,
  },
});
export const createJobStageContract = defineContract({
  method: "POST",
  path: "/api/v1/jobs/{id}/stages",
  operationId: "createJobStage",
  summary: "Create job stage",
  description:
    "Add a stage to a job. Without `position` the stage is inserted before the first hired, rejected or withdrawn stage. Multiple stages may share a kind.",
  tags: ["Jobs", "Pipeline"],
  auth: { scopes: ["stages:write"] },
  idempotent: true,
  parameters: { path: idPath },
  requestBody: jobStageCreateSchema,
  responses: {
    201: successEnvelopeSchema(jobStageSchema),
    400: errorEnvelopeSchema,
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
    409: errorEnvelopeSchema,
    422: errorEnvelopeSchema,
    429: errorEnvelopeSchema,
  },
});
export const updateJobStageContract = defineContract({
  method: "PATCH",
  path: "/api/v1/jobs/{id}/stages/{stageId}",
  operationId: "updateJobStage",
  summary: "Update job stage",
  description:
    "Rename, recolor, change email settings, or change the kind of an active stage. A kind change that would move applications between outcomes is refused; merge them with archive instead.",
  tags: ["Jobs", "Pipeline"],
  auth: { scopes: ["stages:write"] },
  idempotent: true,
  parameters: { path: stagePath },
  requestBody: jobStageUpdateSchema,
  responses: {
    200: successEnvelopeSchema(jobStageSchema),
    400: errorEnvelopeSchema,
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
    409: errorEnvelopeSchema,
    422: errorEnvelopeSchema,
    429: errorEnvelopeSchema,
  },
});
export const reorderJobStagesContract = defineContract({
  method: "POST",
  path: "/api/v1/jobs/{id}/stages/reorder",
  operationId: "reorderJobStages",
  summary: "Reorder job stages",
  description:
    "Set the order of a job's active stages. `stageIds` must list every active stage exactly once.",
  tags: ["Jobs", "Pipeline"],
  auth: { scopes: ["stages:write"] },
  idempotent: true,
  parameters: { path: idPath },
  requestBody: jobStageReorderSchema,
  responses: {
    200: successEnvelopeSchema(z.array(jobStageSchema)),
    400: errorEnvelopeSchema,
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
    409: errorEnvelopeSchema,
    422: errorEnvelopeSchema,
    429: errorEnvelopeSchema,
  },
});
export const archiveJobStageContract = defineContract({
  method: "POST",
  path: "/api/v1/jobs/{id}/stages/{stageId}/archive",
  operationId: "archiveJobStage",
  summary: "Archive job stage",
  description:
    "Retire a stage and keep its history. Applications in it are moved to `mergeIntoStageId`, which must be an active stage with the same outcome (active stages merge into active stages; hired, rejected or withdrawn stages only into a stage of the same kind).",
  tags: ["Jobs", "Pipeline"],
  auth: { scopes: ["stages:write"] },
  idempotent: true,
  parameters: { path: stagePath },
  // The body is optional: a stage with no applications can be archived without one.
  requestBody: jobStageArchiveSchema.nullish(),
  responses: {
    200: successEnvelopeSchema(jobStageArchiveResultSchema),
    400: errorEnvelopeSchema,
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
    409: errorEnvelopeSchema,
    422: errorEnvelopeSchema,
    429: errorEnvelopeSchema,
  },
});
export const deleteJobStageContract = defineContract({
  method: "DELETE",
  path: "/api/v1/jobs/{id}/stages/{stageId}",
  operationId: "deleteJobStage",
  summary: "Delete job stage",
  description:
    "Permanently delete a stage that has never held an application, appears in no history, scorecard, document requirement or automation. Otherwise archive it instead.",
  tags: ["Jobs", "Pipeline"],
  auth: { scopes: ["stages:write"] },
  parameters: { path: stagePath },
  responses: {
    200: successEnvelopeSchema(z.object({ success: z.boolean() })),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
    409: errorEnvelopeSchema,
    429: errorEnvelopeSchema,
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
  createJobStageContract,
  updateJobStageContract,
  reorderJobStagesContract,
  archiveJobStageContract,
  deleteJobStageContract,
] as const;
