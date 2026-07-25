import { z } from "zod";

import {
  offerCreateSchema,
  offerDecisionSchema,
  offerUpdateSchema,
} from "@/server/api/schemas";

import { defineContract } from "./core";
import { errorEnvelopeSchema, successEnvelopeSchema } from "./types";

const offerSchema = z.object({
  id: z.string().uuid(),
  applicationId: z.string().uuid(),
  candidateId: z.string().uuid(),
  jobId: z.string().uuid(),
  status: z.string(),
  title: z.string(),
  salaryAmount: z.number().nullable(),
  currency: z.string().nullable(),
  salaryPeriod: z.string().nullable(),
  equity: z.string().nullable(),
  startDate: z.string().nullable(),
  expiresAt: z.string().nullable(),
  notes: z.string().nullable(),
  decidedAt: z.string().nullable().optional(),
  sentAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const offerIdPath = z.object({ id: z.string().uuid() });
const offerQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
  candidateId: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
  status: z.string().optional(),
});

export const listOffersContract = defineContract({
  method: "GET",
  path: "/api/v1/offers",
  operationId: "listOffers",
  summary: "List offers",
  tags: ["Offers"],
  auth: { scopes: ["offers:read"] },
  parameters: { query: offerQuery },
  responses: {
    200: successEnvelopeSchema(z.array(offerSchema)),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
  },
});

export const createOfferContract = defineContract({
  method: "POST",
  path: "/api/v1/offers",
  operationId: "createOffer",
  summary: "Create offer",
  tags: ["Offers"],
  auth: { scopes: ["offers:write"] },
  idempotent: true,
  requestBody: offerCreateSchema,
  responses: {
    201: successEnvelopeSchema(offerSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    409: errorEnvelopeSchema,
    422: errorEnvelopeSchema,
  },
});

export const getOfferContract = defineContract({
  method: "GET",
  path: "/api/v1/offers/{id}",
  operationId: "getOffer",
  summary: "Get offer",
  tags: ["Offers"],
  auth: { scopes: ["offers:read"] },
  parameters: { path: offerIdPath },
  responses: {
    200: successEnvelopeSchema(offerSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
  },
});

export const updateOfferContract = defineContract({
  method: "PATCH",
  path: "/api/v1/offers/{id}",
  operationId: "updateOffer",
  summary: "Update offer",
  tags: ["Offers"],
  auth: { scopes: ["offers:write"] },
  parameters: { path: offerIdPath },
  requestBody: offerUpdateSchema,
  responses: {
    200: successEnvelopeSchema(offerSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
    422: errorEnvelopeSchema,
  },
});

export const sendOfferContract = defineContract({
  method: "POST",
  path: "/api/v1/offers/{id}/send",
  operationId: "sendOffer",
  summary: "Send offer",
  tags: ["Offers"],
  auth: { scopes: ["offers:write"] },
  idempotent: true,
  parameters: { path: offerIdPath },
  responses: {
    200: successEnvelopeSchema(offerSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
  },
});

export const decideOfferContract = defineContract({
  method: "POST",
  path: "/api/v1/offers/{id}/decision",
  operationId: "decideOffer",
  summary: "Decide offer",
  tags: ["Offers"],
  auth: { scopes: ["offers:write"] },
  idempotent: true,
  parameters: { path: offerIdPath },
  requestBody: offerDecisionSchema,
  responses: {
    200: successEnvelopeSchema(offerSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
    409: errorEnvelopeSchema,
  },
});

export const withdrawOfferContract = defineContract({
  method: "POST",
  path: "/api/v1/offers/{id}/withdraw",
  operationId: "withdrawOffer",
  summary: "Withdraw offer",
  tags: ["Offers"],
  auth: { scopes: ["offers:write"] },
  idempotent: true,
  parameters: { path: offerIdPath },
  responses: {
    200: successEnvelopeSchema(offerSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
  },
});

export const offersContracts = [
  listOffersContract,
  createOfferContract,
  getOfferContract,
  updateOfferContract,
  sendOfferContract,
  decideOfferContract,
  withdrawOfferContract,
] as const;
