import { z } from "zod";

import { apiKeyCreateSchema } from "@/server/api/schemas";

import { defineContract } from "./core";
import { errorEnvelopeSchema, successEnvelopeSchema } from "./types";

const apiKeySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: z.string(),
  environment: z.string(),
  prefix: z.string(),
  last4: z.string(),
  scopes: z.array(z.string()),
  lastUsedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdAt: z.string(),
});

const apiKeyIdPath = z.object({ id: z.string().uuid() });

export const listApiKeysContract = defineContract({
  method: "GET",
  path: "/api/v1/api-keys",
  operationId: "listApiKeys",
  summary: "List API keys",
  tags: ["API Keys"],
  auth: { scopes: ["api_keys:read"] },
  responses: {
    200: successEnvelopeSchema(z.array(apiKeySchema)),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
  },
});

export const createApiKeyContract = defineContract({
  method: "POST",
  path: "/api/v1/api-keys",
  operationId: "createApiKey",
  summary: "Create API key",
  tags: ["API Keys"],
  auth: { scopes: ["api_keys:write"] },
  idempotent: true,
  requestBody: apiKeyCreateSchema,
  responses: {
    201: successEnvelopeSchema(
      z.object({
        ...apiKeySchema.shape,
        key: z.string(),
      }),
    ),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    409: errorEnvelopeSchema,
    422: errorEnvelopeSchema,
  },
});

export const deleteApiKeyContract = defineContract({
  method: "DELETE",
  path: "/api/v1/api-keys/{id}",
  operationId: "deleteApiKey",
  summary: "Delete API key",
  tags: ["API Keys"],
  auth: { scopes: ["api_keys:write"] },
  parameters: { path: apiKeyIdPath },
  responses: {
    200: successEnvelopeSchema(z.object({ deleted: z.boolean() })),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
  },
});

export const rotateApiKeyContract = defineContract({
  method: "POST",
  path: "/api/v1/api-keys/{id}/rotate",
  operationId: "rotateApiKey",
  summary: "Rotate API key",
  tags: ["API Keys"],
  auth: { scopes: ["api_keys:write"] },
  idempotent: true,
  parameters: { path: apiKeyIdPath },
  responses: {
    201: successEnvelopeSchema(
      z.object({
        replacedKeyId: z.string().uuid(),
        apiKey: apiKeySchema.extend({ key: z.string() }),
        key: z.string(),
      }),
    ),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
    409: errorEnvelopeSchema,
  },
});

export const apiKeysContracts = [
  listApiKeysContract,
  createApiKeyContract,
  deleteApiKeyContract,
  rotateApiKeyContract,
] as const;
