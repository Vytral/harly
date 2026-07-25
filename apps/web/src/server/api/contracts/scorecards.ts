import { z } from "zod";

import { scorecardCreateSchema } from "@/server/api/schemas";

import { defineContract } from "./core";
import { errorEnvelopeSchema, successEnvelopeSchema } from "./types";

const scorecardSchema = z.object({
  id: z.string().uuid(),
  candidateId: z.string().uuid(),
  applicationId: z.string().uuid().nullable(),
  stageId: z.string().uuid().nullable(),
  stageName: z.string().nullable(),
  authorId: z.string().uuid(),
  rating: z.enum(["strong", "mixed", "weak"]),
  comment: z.string().nullable(),
  criteria: z.array(z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const scorecardQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
  candidateId: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
});

export const listScorecardsContract = defineContract({
  method: "GET",
  path: "/api/v1/scorecards",
  operationId: "listScorecards",
  summary: "List scorecards",
  tags: ["Scorecards"],
  auth: { scopes: ["scorecards:read"] },
  parameters: { query: scorecardQuery },
  responses: {
    200: successEnvelopeSchema(z.array(scorecardSchema)),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
  },
});

export const createScorecardContract = defineContract({
  method: "POST",
  path: "/api/v1/scorecards",
  operationId: "createScorecard",
  summary: "Create scorecard",
  tags: ["Scorecards"],
  auth: { scopes: ["scorecards:write"] },
  idempotent: true,
  requestBody: scorecardCreateSchema,
  responses: {
    201: successEnvelopeSchema(scorecardSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    409: errorEnvelopeSchema,
    422: errorEnvelopeSchema,
  },
});

export const scorecardsContracts = [
  listScorecardsContract,
  createScorecardContract,
] as const;
