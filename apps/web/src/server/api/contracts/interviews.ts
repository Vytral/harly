import { z } from "zod";

import {
  interviewCreateSchema,
  interviewUpdateSchema,
} from "@/server/api/schemas";

import { defineContract } from "./core";
import { errorEnvelopeSchema, successEnvelopeSchema } from "./types";

const interviewSchema = z.object({
  id: z.string().uuid(),
  applicationId: z.string().uuid(),
  candidateId: z.string().uuid(),
  jobId: z.string().uuid(),
  interviewerId: z.string().nullable(),
  title: z.string().nullable(),
  type: z.string(),
  mode: z.string(),
  status: z.string(),
  scheduledAt: z.string(),
  durationMins: z.number(),
  location: z.string().nullable(),
  notes: z.string().nullable(),
  source: z.string().nullable(),
  meetingUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const interviewIdPath = z.object({ id: z.string().uuid() });
const interviewQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
  candidateId: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
  interviewerId: z.string().uuid().optional(),
  status: z.string().optional(),
});

export const listInterviewsContract = defineContract({
  method: "GET",
  path: "/api/v1/interviews",
  operationId: "listInterviews",
  summary: "List interviews",
  tags: ["Interviews"],
  auth: { scopes: ["interviews:read"] },
  parameters: { query: interviewQuery },
  responses: {
    200: successEnvelopeSchema(z.array(interviewSchema)),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
  },
});

export const createInterviewContract = defineContract({
  method: "POST",
  path: "/api/v1/interviews",
  operationId: "createInterview",
  summary: "Create interview",
  tags: ["Interviews"],
  auth: { scopes: ["interviews:write"] },
  idempotent: true,
  requestBody: interviewCreateSchema,
  responses: {
    201: successEnvelopeSchema(interviewSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    409: errorEnvelopeSchema,
    422: errorEnvelopeSchema,
  },
});

export const getInterviewContract = defineContract({
  method: "GET",
  path: "/api/v1/interviews/{id}",
  operationId: "getInterview",
  summary: "Get interview",
  tags: ["Interviews"],
  auth: { scopes: ["interviews:read"] },
  parameters: { path: interviewIdPath },
  responses: {
    200: successEnvelopeSchema(interviewSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
  },
});

export const updateInterviewContract = defineContract({
  method: "PATCH",
  path: "/api/v1/interviews/{id}",
  operationId: "updateInterview",
  summary: "Update interview",
  tags: ["Interviews"],
  auth: { scopes: ["interviews:write"] },
  parameters: { path: interviewIdPath },
  requestBody: interviewUpdateSchema,
  responses: {
    200: successEnvelopeSchema(interviewSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
    422: errorEnvelopeSchema,
  },
});

export const cancelInterviewContract = defineContract({
  method: "POST",
  path: "/api/v1/interviews/{id}/cancel",
  operationId: "cancelInterview",
  summary: "Cancel interview",
  tags: ["Interviews"],
  auth: { scopes: ["interviews:write"] },
  idempotent: true,
  parameters: { path: interviewIdPath },
  responses: {
    200: successEnvelopeSchema(interviewSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
  },
});

export const completeInterviewContract = defineContract({
  method: "POST",
  path: "/api/v1/interviews/{id}/complete",
  operationId: "completeInterview",
  summary: "Complete interview",
  tags: ["Interviews"],
  auth: { scopes: ["interviews:write"] },
  idempotent: true,
  parameters: { path: interviewIdPath },
  responses: {
    200: successEnvelopeSchema(interviewSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
  },
});

export const interviewsContracts = [
  listInterviewsContract,
  createInterviewContract,
  getInterviewContract,
  updateInterviewContract,
  cancelInterviewContract,
  completeInterviewContract,
] as const;
