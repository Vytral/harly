import { z } from "zod";
import {
  candidateCreateSchema,
  candidateNoteCreateSchema,
  candidateTagCreateSchema,
  candidateUpdateSchema,
} from "@/server/api/schemas";

import { defineContract } from "./core";
import { errorEnvelopeSchema, successEnvelopeSchema } from "./types";

const noteSchema = z.object({
  id: z.string().uuid(),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  author: z.object({
    id: z.string(),
    name: z.string(),
  }),
  mentions: z.array(
    z.object({
      userId: z.string(),
      name: z.string(),
    }),
  ),
});

const tagSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  createdAt: z.string(),
});

const fileSchema = z.object({
  id: z.string().uuid(),
  fileName: z.string(),
  fileType: z.string().nullable(),
  fileSize: z.number().nullable(),
  createdAt: z.string(),
});

const candidateSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  location: z.string().nullable(),
  headline: z.string().nullable(),
  summary: z.string().nullable(),
  linkedinUrl: z.string().url().nullable(),
  githubUrl: z.string().url().nullable(),
  websiteUrl: z.string().url().nullable(),
  educationEntries: z.array(z.any()),
  experienceEntries: z.array(z.any()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const candidateIdPath = z.object({ id: z.string().uuid() });
const candidateTagPath = z.object({
  id: z.string().uuid(),
  tagId: z.string().uuid(),
});
const candidateQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

export const listCandidatesContract = defineContract({
  method: "GET",
  path: "/api/v1/candidates",
  operationId: "listCandidates",
  summary: "List candidates",
  tags: ["Candidates"],
  auth: { scopes: ["candidates:read"] },
  parameters: { query: candidateQuery },
  responses: {
    200: successEnvelopeSchema(z.array(candidateSchema)),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
  },
});

export const createCandidateContract = defineContract({
  method: "POST",
  path: "/api/v1/candidates",
  operationId: "createCandidate",
  summary: "Create candidate",
  tags: ["Candidates"],
  auth: { scopes: ["candidates:write"] },
  idempotent: true,
  requestBody: candidateCreateSchema,
  responses: {
    201: successEnvelopeSchema(candidateSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    409: errorEnvelopeSchema,
    422: errorEnvelopeSchema,
  },
});

export const getCandidateContract = defineContract({
  method: "GET",
  path: "/api/v1/candidates/{id}",
  operationId: "getCandidate",
  summary: "Get candidate",
  tags: ["Candidates"],
  auth: { scopes: ["candidates:read"] },
  parameters: { path: candidateIdPath },
  responses: {
    200: successEnvelopeSchema(candidateSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
  },
});

export const updateCandidateContract = defineContract({
  method: "PATCH",
  path: "/api/v1/candidates/{id}",
  operationId: "updateCandidate",
  summary: "Update candidate",
  tags: ["Candidates"],
  auth: { scopes: ["candidates:write"] },
  parameters: { path: candidateIdPath },
  requestBody: candidateUpdateSchema,
  responses: {
    200: successEnvelopeSchema(candidateSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
    422: errorEnvelopeSchema,
  },
});

export const deleteCandidateContract = defineContract({
  method: "DELETE",
  path: "/api/v1/candidates/{id}",
  operationId: "deleteCandidate",
  summary: "Delete candidate",
  tags: ["Candidates"],
  auth: { scopes: ["candidates:write"] },
  parameters: { path: candidateIdPath },
  responses: {
    200: successEnvelopeSchema(z.object({ deleted: z.boolean() })),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
  },
});

export const listCandidateNotesContract = defineContract({
  method: "GET",
  path: "/api/v1/candidates/{id}/notes",
  operationId: "listCandidateNotes",
  summary: "List candidate notes",
  tags: ["Candidates"],
  auth: { scopes: ["notes:read"] },
  parameters: { path: candidateIdPath },
  responses: {
    200: successEnvelopeSchema(z.array(noteSchema)),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
  },
});

export const createCandidateNoteContract = defineContract({
  method: "POST",
  path: "/api/v1/candidates/{id}/notes",
  operationId: "createCandidateNote",
  summary: "Create candidate note",
  tags: ["Candidates"],
  auth: { scopes: ["notes:write"] },
  idempotent: true,
  parameters: { path: candidateIdPath },
  requestBody: candidateNoteCreateSchema,
  responses: {
    201: successEnvelopeSchema(noteSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    422: errorEnvelopeSchema,
  },
});

export const listCandidateTagsContract = defineContract({
  method: "GET",
  path: "/api/v1/candidates/{id}/tags",
  operationId: "listCandidateTags",
  summary: "List candidate tags",
  tags: ["Candidates"],
  auth: { scopes: ["tags:read"] },
  parameters: { path: candidateIdPath },
  responses: {
    200: successEnvelopeSchema(z.array(tagSchema)),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
  },
});

export const createCandidateTagContract = defineContract({
  method: "POST",
  path: "/api/v1/candidates/{id}/tags",
  operationId: "createCandidateTag",
  summary: "Create candidate tag",
  tags: ["Candidates"],
  auth: { scopes: ["tags:write"] },
  idempotent: true,
  parameters: { path: candidateIdPath },
  requestBody: candidateTagCreateSchema,
  responses: {
    200: successEnvelopeSchema(tagSchema),
    201: successEnvelopeSchema(tagSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    422: errorEnvelopeSchema,
  },
});

export const deleteCandidateTagContract = defineContract({
  method: "DELETE",
  path: "/api/v1/candidates/{id}/tags/{tagId}",
  operationId: "deleteCandidateTag",
  summary: "Delete candidate tag",
  tags: ["Candidates"],
  auth: { scopes: ["tags:write"] },
  parameters: { path: candidateTagPath },
  responses: {
    200: successEnvelopeSchema(z.object({ deleted: z.boolean() })),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
  },
});

export const listCandidateFilesContract = defineContract({
  method: "GET",
  path: "/api/v1/candidates/{id}/files",
  operationId: "listCandidateFiles",
  summary: "List candidate files",
  tags: ["Candidates"],
  auth: { scopes: ["files:read"] },
  parameters: { path: candidateIdPath },
  responses: {
    200: successEnvelopeSchema(z.array(fileSchema)),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
  },
});

export const candidatesContracts = [
  listCandidatesContract,
  createCandidateContract,
  getCandidateContract,
  updateCandidateContract,
  deleteCandidateContract,
  listCandidateNotesContract,
  createCandidateNoteContract,
  listCandidateTagsContract,
  createCandidateTagContract,
  deleteCandidateTagContract,
  listCandidateFilesContract,
] as const;
