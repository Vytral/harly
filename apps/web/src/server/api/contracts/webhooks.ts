import { z } from "zod";

import { webhookCreateSchema, webhookUpdateSchema } from "@/server/api/schemas";

import { defineContract } from "./core";
import { errorEnvelopeSchema, successEnvelopeSchema } from "./types";

const webhookSchema = z.object({
  id: z.string().uuid(),
  url: z.string().url(),
  description: z.string().nullable(),
  events: z.array(z.string()),
  enabled: z.boolean(),
  createdAt: z.string(),
});

const deliverySchema = z.object({
  id: z.string().uuid(),
  event: z.string(),
  status: z.string(),
  attempts: z.number(),
  responseStatus: z.number().nullable(),
  nextRetryAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  createdAt: z.string(),
});

const webhookIdPath = z.object({ id: z.string().uuid() });
const webhookDeliveryPath = z.object({
  id: z.string().uuid(),
  deliveryId: z.string().uuid(),
});
const deliveryQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.string().optional(),
});

export const listWebhooksContract = defineContract({
  method: "GET",
  path: "/api/v1/webhooks",
  operationId: "listWebhooks",
  summary: "List webhooks",
  tags: ["Webhooks"],
  auth: { scopes: ["webhooks:read"] },
  responses: {
    200: successEnvelopeSchema(z.array(webhookSchema)),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
  },
});

export const createWebhookContract = defineContract({
  method: "POST",
  path: "/api/v1/webhooks",
  operationId: "createWebhook",
  summary: "Create webhook",
  tags: ["Webhooks"],
  auth: { scopes: ["webhooks:write"] },
  idempotent: true,
  requestBody: webhookCreateSchema,
  responses: {
    201: successEnvelopeSchema(
      z.object({
        ...webhookSchema.shape,
        secret: z.string(),
      }),
    ),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    409: errorEnvelopeSchema,
    422: errorEnvelopeSchema,
  },
});

export const updateWebhookContract = defineContract({
  method: "PATCH",
  path: "/api/v1/webhooks/{id}",
  operationId: "updateWebhook",
  summary: "Update webhook",
  tags: ["Webhooks"],
  auth: { scopes: ["webhooks:write"] },
  parameters: { path: webhookIdPath },
  requestBody: webhookUpdateSchema,
  responses: {
    200: successEnvelopeSchema(webhookSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
    422: errorEnvelopeSchema,
  },
});

export const deleteWebhookContract = defineContract({
  method: "DELETE",
  path: "/api/v1/webhooks/{id}",
  operationId: "deleteWebhook",
  summary: "Delete webhook",
  tags: ["Webhooks"],
  auth: { scopes: ["webhooks:write"] },
  parameters: { path: webhookIdPath },
  responses: {
    200: successEnvelopeSchema(z.object({ deleted: z.boolean() })),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
  },
});

export const testWebhookContract = defineContract({
  method: "POST",
  path: "/api/v1/webhooks/{id}/test",
  operationId: "testWebhook",
  summary: "Test webhook",
  tags: ["Webhooks"],
  auth: { scopes: ["webhooks:write"] },
  idempotent: true,
  parameters: { path: webhookIdPath },
  responses: {
    200: successEnvelopeSchema(
      z.object({
        delivered: z.boolean(),
        status: z.string(),
        deliveryId: z.string().uuid(),
      }),
    ),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
  },
});

export const listWebhookDeliveriesContract = defineContract({
  method: "GET",
  path: "/api/v1/webhooks/{id}/deliveries",
  operationId: "listWebhookDeliveries",
  summary: "List webhook deliveries",
  tags: ["Webhooks"],
  auth: { scopes: ["webhooks:read"] },
  parameters: { path: webhookIdPath, query: deliveryQuery },
  responses: {
    200: successEnvelopeSchema(z.array(deliverySchema)),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
  },
});

export const replayWebhookDeliveryContract = defineContract({
  method: "POST",
  path: "/api/v1/webhooks/{id}/deliveries/{deliveryId}/replay",
  operationId: "replayWebhookDelivery",
  summary: "Replay webhook delivery",
  tags: ["Webhooks"],
  auth: { scopes: ["webhooks:write"] },
  idempotent: true,
  parameters: { path: webhookDeliveryPath },
  responses: {
    202: successEnvelopeSchema(deliverySchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
  },
});

export const webhooksContracts = [
  listWebhooksContract,
  createWebhookContract,
  updateWebhookContract,
  deleteWebhookContract,
  testWebhookContract,
  listWebhookDeliveriesContract,
  replayWebhookDeliveryContract,
] as const;
