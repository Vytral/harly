import { z } from "zod";

import { poolEntryCreateSchema } from "@/server/api/schemas";

import { defineContract } from "./core";
import { errorEnvelopeSchema, successEnvelopeSchema } from "./types";

const poolEntrySchema = z.object({
  id: z.string().uuid(),
  candidateId: z.string().uuid(),
  jobId: z.string().uuid().nullable(),
  source: z.enum(["applied", "imported", "sourced", "referred"]),
  reason: z.string().nullable(),
  addedById: z.string().uuid(),
  addedAt: z.string(),
  removedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const poolQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
  candidateId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
  source: z.enum(["applied", "imported", "sourced", "referred"]).optional(),
});

const poolIdPath = z.object({ id: z.string().uuid() });

export const listPoolEntriesContract = defineContract({
  method: "GET",
  path: "/api/v1/pool-entries",
  operationId: "listPoolEntries",
  summary: "List pool entries",
  tags: ["Pool"],
  auth: { scopes: ["pool:read"] },
  parameters: { query: poolQuery },
  responses: {
    200: successEnvelopeSchema(z.array(poolEntrySchema)),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
  },
});

export const createPoolEntryContract = defineContract({
  method: "POST",
  path: "/api/v1/pool-entries",
  operationId: "createPoolEntry",
  summary: "Create pool entry",
  tags: ["Pool"],
  auth: { scopes: ["pool:write"] },
  idempotent: true,
  requestBody: poolEntryCreateSchema,
  responses: {
    201: successEnvelopeSchema(poolEntrySchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    409: errorEnvelopeSchema,
    422: errorEnvelopeSchema,
  },
});

export const deletePoolEntryContract = defineContract({
  method: "DELETE",
  path: "/api/v1/pool-entries/{id}",
  operationId: "deletePoolEntry",
  summary: "Remove pool entry",
  tags: ["Pool"],
  auth: { scopes: ["pool:write"] },
  parameters: { path: poolIdPath },
  responses: {
    200: successEnvelopeSchema(z.object({ deleted: z.boolean() })),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
  },
});

export const assignPoolEntryContract = defineContract({
  method: "POST",
  path: "/api/v1/pool-entries/{id}/assign",
  operationId: "assignPoolEntry",
  summary: "Assign pool entry",
  tags: ["Pool"],
  auth: { scopes: ["pool:write"] },
  idempotent: true,
  parameters: { path: poolIdPath },
  requestBody: z.object({ jobId: z.string().uuid() }),
  responses: {
    201: successEnvelopeSchema(
      z.object({ id: z.string().uuid() }).passthrough(),
    ),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
    409: errorEnvelopeSchema,
    422: errorEnvelopeSchema,
  },
});

export const poolEntriesContracts = [
  listPoolEntriesContract,
  createPoolEntryContract,
  deletePoolEntryContract,
  assignPoolEntryContract,
] as const;
