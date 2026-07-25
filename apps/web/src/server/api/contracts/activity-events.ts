import { z } from "zod";

import { defineContract } from "./core";
import { errorEnvelopeSchema, successEnvelopeSchema } from "./types";

const activityEventSchema = z.object({
  id: z.string().uuid(),
  entityType: z.enum([
    "candidate",
    "application",
    "job",
    "note",
    "document",
    "task",
  ]),
  entityId: z.string().uuid(),
  type: z.string(),
  actor: z.object({ id: z.string().uuid(), name: z.string() }).nullable(),
  metadata: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ),
  createdAt: z.string(),
});

const activityQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
  entityType: z
    .enum(["candidate", "application", "job", "note", "document", "task"])
    .optional(),
  entityId: z.string().uuid().optional(),
  type: z.string().optional(),
});

export const listActivityEventsContract = defineContract({
  method: "GET",
  path: "/api/v1/activity-events",
  operationId: "listActivityEvents",
  summary: "List activity events",
  tags: ["Activity"],
  auth: { scopes: ["activity:read"] },
  parameters: { query: activityQuery },
  responses: {
    200: successEnvelopeSchema(z.array(activityEventSchema)),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
  },
});

export const activityEventsContracts = [listActivityEventsContract] as const;
