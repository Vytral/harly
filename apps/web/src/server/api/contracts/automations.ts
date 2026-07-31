import { z } from "zod";

import { workflowInputSchema } from "@/features/automations/schema";

import { defineContract } from "./core";
import { errorEnvelopeSchema, successEnvelopeSchema } from "./types";

const workflowSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  enabled: z.boolean(),
  status: z.enum(["draft", "published", "paused"]),
  triggerEvent: z.string(),
  trigger: z.unknown(),
  conditions: z.unknown(),
  actions: z.unknown(),
  createdById: z.string().uuid().nullable(),
  definitionVersion: z.number().int().positive(),
  approvalRequestedAt: z.string().nullable(),
  approvedById: z.string().uuid().nullable(),
  approvedAt: z.string().nullable(),
  publishedById: z.string().uuid().nullable(),
  publishedAt: z.string().nullable(),
  maxRunsPerMinute: z.number().int().positive(),
  maxExternalActionsPerMinute: z.number().int().positive(),
  circuitBreakerThreshold: z.number().int().positive(),
  circuitBreakerCooldownSeconds: z.number().int().positive(),
  circuitOpenUntil: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const runSchema = z.object({
  id: z.string().uuid(),
  workflowId: z.string().uuid(),
  triggerEvent: z.string(),
  triggerPayload: z.unknown(),
  conditionResult: z.unknown(),
  status: z.string(),
  definitionVersion: z.number().int().positive(),
  attemptCount: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  nextAttemptAt: z.string(),
  lockedAt: z.string().nullable(),
  heartbeatAt: z.string().nullable(),
  deadLetteredAt: z.string().nullable(),
  cancelRequestedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  startStepIndex: z.number().int().nonnegative(),
  replayOfRunId: z.string().uuid().nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  parentRunId: z.string().uuid().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
});

const workflowPath = z.object({ id: z.string().uuid() });
const runLimit = z.preprocess((value) => {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100 ? parsed : 50;
}, z.number().int().min(1).max(100));
const runQuery = z.object({
  limit: runLimit.optional(),
  cursor: z.string().min(1).optional(),
});

export const listAutomationsContract = defineContract({
  method: "GET",
  path: "/api/v1/automations",
  operationId: "listAutomations",
  summary: "List automations",
  tags: ["Automations"],
  auth: { scopes: ["automations:read"] },
  responses: {
    200: successEnvelopeSchema(z.array(workflowSchema)),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
  },
});

export const createAutomationContract = defineContract({
  method: "POST",
  path: "/api/v1/automations",
  operationId: "createAutomation",
  summary: "Create automation",
  tags: ["Automations"],
  auth: { scopes: ["automations:write"] },
  idempotent: true,
  requestBody: workflowInputSchema,
  responses: {
    201: successEnvelopeSchema(workflowSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    422: errorEnvelopeSchema,
  },
});

export const listAutomationRunsContract = defineContract({
  method: "GET",
  path: "/api/v1/automations/{id}/runs",
  operationId: "listAutomationRuns",
  summary: "List automation runs",
  tags: ["Automations"],
  auth: { scopes: ["automations:read"] },
  parameters: { path: workflowPath, query: runQuery },
  responses: {
    200: successEnvelopeSchema(z.array(runSchema)),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
  },
});

const automationRunActionPath = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
});

export const retryAutomationRunContract = defineContract({
  method: "POST",
  path: "/api/v1/automations/{id}/runs/{runId}/retry",
  operationId: "retryAutomationRun",
  summary: "Retry automation run",
  tags: ["Automations"],
  auth: { scopes: ["automations:write"] },
  parameters: { path: automationRunActionPath },
  responses: {
    200: successEnvelopeSchema(runSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    409: errorEnvelopeSchema,
  },
});

export const cancelAutomationRunContract = defineContract({
  method: "POST",
  path: "/api/v1/automations/{id}/runs/{runId}/cancel",
  operationId: "cancelAutomationRun",
  summary: "Cancel automation run",
  tags: ["Automations"],
  auth: { scopes: ["automations:write"] },
  parameters: { path: automationRunActionPath },
  responses: {
    200: successEnvelopeSchema(runSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    409: errorEnvelopeSchema,
  },
});

export const getAutomationByIdContract = defineContract({
  method: "GET",
  path: "/api/v1/automations/{id}",
  operationId: "getAutomationById",
  summary: "Get automation",
  tags: ["Automations"],
  auth: { scopes: ["automations:read"] },
  parameters: { path: workflowPath },
  responses: {
    200: successEnvelopeSchema(workflowSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
  },
});

export const updateAutomationByIdContract = defineContract({
  method: "PATCH",
  path: "/api/v1/automations/{id}",
  operationId: "updateAutomationById",
  summary: "Update automation",
  tags: ["Automations"],
  auth: { scopes: ["automations:write"] },
  parameters: { path: workflowPath },
  requestBody: workflowInputSchema.partial(),
  responses: {
    200: successEnvelopeSchema(workflowSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
    422: errorEnvelopeSchema,
  },
});

export const deleteAutomationByIdContract = defineContract({
  method: "DELETE",
  path: "/api/v1/automations/{id}",
  operationId: "deleteAutomationById",
  summary: "Delete automation",
  tags: ["Automations"],
  auth: { scopes: ["automations:write"] },
  parameters: { path: workflowPath },
  responses: {
    200: successEnvelopeSchema(z.object({ deleted: z.boolean() })),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
  },
});

export const automationsContracts = [
  listAutomationsContract,
  createAutomationContract,
  getAutomationByIdContract,
  updateAutomationByIdContract,
  deleteAutomationByIdContract,
  listAutomationRunsContract,
  retryAutomationRunContract,
  cancelAutomationRunContract,
] as const;
