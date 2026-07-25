import { z } from "zod";

import {
  applicationBulkCreateSchema,
  applicationCreateSchema,
  applicationMoveSchema,
} from "@/server/api/schemas";

import { defineContract } from "./core";
import { errorEnvelopeSchema, successEnvelopeSchema } from "./types";

const applicationSchema = z.object({
  id: z.string().uuid(),
  candidateId: z.string().uuid(),
  jobId: z.string().uuid(),
  currentStageId: z.string().uuid().nullable(),
  status: z.string(),
  source: z.string().nullable(),
  pipelineOrder: z.number(),
  appliedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const applicationPath = z.object({ id: z.string().uuid() });
const applicationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
  jobId: z.string().uuid().optional(),
  status: z.string().optional(),
});

const bulkResultSchema = z.object({
  items: z.array(
    z.union([
      z.object({
        candidateId: z.string().uuid(),
        outcome: z.literal("created"),
        application: applicationSchema,
      }),
      z.object({
        candidateId: z.string().uuid(),
        outcome: z.literal("conflict"),
        error: z.string().optional(),
      }),
      z.object({
        candidateId: z.string().uuid(),
        outcome: z.literal("failed"),
        error: z.string().optional(),
      }),
    ]),
  ),
  summary: z.object({
    created: z.number(),
    conflicts: z.number(),
    failed: z.number(),
  }),
});

export const listApplicationsContract = defineContract({
  method: "GET",
  path: "/api/v1/applications",
  operationId: "listApplications",
  summary: "List applications",
  tags: ["Applications"],
  auth: { scopes: ["applications:read"] },
  parameters: { query: applicationQuery },
  responses: {
    200: successEnvelopeSchema(z.array(applicationSchema)),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
  },
});

export const createApplicationContract = defineContract({
  method: "POST",
  path: "/api/v1/applications",
  operationId: "createApplication",
  summary: "Create application",
  tags: ["Applications"],
  auth: { scopes: ["applications:write"] },
  idempotent: true,
  requestBody: applicationCreateSchema,
  responses: {
    201: successEnvelopeSchema(applicationSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    409: errorEnvelopeSchema,
    422: errorEnvelopeSchema,
  },
});

export const getApplicationContract = defineContract({
  method: "GET",
  path: "/api/v1/applications/{id}",
  operationId: "getApplication",
  summary: "Get application",
  tags: ["Applications"],
  auth: { scopes: ["applications:read"] },
  parameters: { path: applicationPath },
  responses: {
    200: successEnvelopeSchema(applicationSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
  },
});

export const moveApplicationContract = defineContract({
  method: "POST",
  path: "/api/v1/applications/{id}/move",
  operationId: "moveApplication",
  summary: "Move application",
  tags: ["Applications"],
  auth: { scopes: ["applications:write"] },
  idempotent: true,
  parameters: { path: applicationPath },
  requestBody: applicationMoveSchema,
  responses: {
    200: successEnvelopeSchema(applicationSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
    422: errorEnvelopeSchema,
  },
});

export const rejectApplicationContract = defineContract({
  method: "POST",
  path: "/api/v1/applications/{id}/reject",
  operationId: "rejectApplication",
  summary: "Reject application",
  tags: ["Applications"],
  auth: { scopes: ["applications:write"] },
  idempotent: true,
  parameters: { path: applicationPath },
  responses: {
    200: successEnvelopeSchema(applicationSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
  },
});

export const hireApplicationContract = defineContract({
  method: "POST",
  path: "/api/v1/applications/{id}/hire",
  operationId: "hireApplication",
  summary: "Hire application",
  tags: ["Applications"],
  auth: { scopes: ["applications:write"] },
  idempotent: true,
  parameters: { path: applicationPath },
  responses: {
    200: successEnvelopeSchema(applicationSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
  },
});

export const bulkApplicationsContract = defineContract({
  method: "POST",
  path: "/api/v1/applications/bulk",
  operationId: "bulkCreateApplications",
  summary: "Bulk create applications",
  tags: ["Applications"],
  auth: { scopes: ["applications:write"] },
  idempotent: true,
  requestBody: applicationBulkCreateSchema,
  responses: {
    200: successEnvelopeSchema(bulkResultSchema),
    201: successEnvelopeSchema(bulkResultSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    409: errorEnvelopeSchema,
    422: errorEnvelopeSchema,
  },
});

export const applicationsContracts = [
  listApplicationsContract,
  createApplicationContract,
  getApplicationContract,
  moveApplicationContract,
  rejectApplicationContract,
  hireApplicationContract,
  bulkApplicationsContract,
] as const;
