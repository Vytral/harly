import { NextResponse } from "next/server";

import { API_SCOPES, type ApiScope } from "@harly/api";

import { CORS_HEADERS } from "@/server/api/respond";
import { WEBHOOK_EVENTS } from "@/server/webhooks/events";

export const runtime = "nodejs";

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

const idParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
} as const;
const stageIdParam = {
  name: "stageId",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
} as const;
const tagIdParam = {
  name: "tagId",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
} as const;
const deliveryIdParam = {
  name: "deliveryId",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
} as const;
const listParams = [
  { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
  { name: "cursor", in: "query", schema: { type: "string" } },
] as const;
const idempotencyParam = {
  name: "Idempotency-Key",
  in: "header",
  required: false,
  description: "Replay a matching POST safely for 24 hours.",
  schema: { type: "string", minLength: 1, maxLength: 255 },
} as const;

type Parameter = typeof idParam | typeof stageIdParam | typeof tagIdParam | typeof deliveryIdParam | (typeof listParams)[number] | typeof idempotencyParam;
type OperationInput = {
  summary: string;
  operationId: string;
  scope?: ApiScope;
  parameters?: readonly Parameter[];
  status?: "200" | "201" | "202" | "204";
  idempotent?: boolean;
};

const rateHeaders = {
  "X-RateLimit-Limit": { $ref: "#/components/headers/RateLimitLimit" },
  "X-RateLimit-Remaining": { $ref: "#/components/headers/RateLimitRemaining" },
  "X-RateLimit-Reset": { $ref: "#/components/headers/RateLimitReset" },
};

function responses(status: OperationInput["status"] = "200") {
  return {
    [status]: { description: status === "201" ? "Created" : "OK", headers: rateHeaders },
    "400": { $ref: "#/components/responses/BadRequest" },
    "401": { $ref: "#/components/responses/Unauthorized" },
    "403": { $ref: "#/components/responses/Forbidden" },
    "404": { $ref: "#/components/responses/NotFound" },
    "409": { $ref: "#/components/responses/Conflict" },
    "422": { $ref: "#/components/responses/ValidationError" },
    "429": { $ref: "#/components/responses/RateLimited" },
  };
}

function operation(input: OperationInput) {
  return {
    summary: input.summary,
    operationId: input.operationId,
    "x-scopes": input.scope ? [input.scope] : [],
    parameters: [
      ...(input.parameters ?? []),
      ...(input.idempotent ? [idempotencyParam] : []),
    ],
    responses: responses(input.status),
  };
}

const read = (summary: string, operationId: string, scope: ApiScope, parameters?: readonly Parameter[]) =>
  operation({ summary, operationId, scope, parameters });
const write = (
  summary: string,
  operationId: string,
  scope: ApiScope,
  parameters?: readonly Parameter[],
  status: OperationInput["status"] = "200",
) => operation({ summary, operationId, scope, parameters, status });
const post = (
  summary: string,
  operationId: string,
  scope: ApiScope,
  parameters?: readonly Parameter[],
  status: OperationInput["status"] = "200",
) => operation({ summary, operationId, scope, parameters, status, idempotent: true });

/** GET /api/v1/openapi.json , OpenAPI 3.1 REST API description. */
export function GET() {
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Harly ATS API",
      version: "1.0.0",
      description:
        "REST API for Harly ATS. Secret API keys use Authorization: Bearer harly_sk_...; responses use { data, meta? } or { error } envelopes.",
    },
    servers: [{ url: `${baseUrl()}/api/v1` }],
    security: [{ bearerAuth: [] }],
    "x-scopes": API_SCOPES,
    "x-webhook-events": WEBHOOK_EVENTS,
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "harly_sk" },
      },
      headers: {
        RateLimitLimit: { description: "Requests allowed in current window.", schema: { type: "integer" } },
        RateLimitRemaining: { description: "Requests remaining in current window.", schema: { type: "integer" } },
        RateLimitReset: { description: "Unix timestamp when current window resets.", schema: { type: "integer" } },
        RetryAfter: { description: "Seconds until another request may be made.", schema: { type: "integer" } },
      },
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                details: {},
              },
            },
          },
        },
      },
      responses: {
        BadRequest: { description: "Invalid request.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        Unauthorized: { description: "Missing, invalid, expired, or revoked API key.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        Forbidden: { description: "API key lacks required scope.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        NotFound: { description: "Resource not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        Conflict: { description: "Resource state or Idempotency-Key conflicts.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        ValidationError: { description: "Request validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        RateLimited: { description: "Rate limit exceeded.", headers: { ...rateHeaders, "Retry-After": { $ref: "#/components/headers/RetryAfter" } }, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
    paths: {
      "/jobs": {
        get: read("List jobs", "listJobs", "jobs:read", listParams),
        post: post("Create job", "createJob", "jobs:write", [], "201"),
      },
      "/jobs/{id}": {
        get: read("Get job", "getJob", "jobs:read", [idParam]),
        patch: write("Update job", "updateJob", "jobs:write", [idParam]),
        delete: write("Delete job", "deleteJob", "jobs:write", [idParam]),
      },
      "/jobs/{id}/publish": { post: post("Publish job", "publishJob", "jobs:write", [idParam]) },
      "/jobs/{id}/close": { post: post("Close job", "closeJob", "jobs:write", [idParam]) },
      "/jobs/{id}/stages": {
        get: read("List job stages", "listJobStages", "stages:read", [idParam]),
      },
      "/jobs/{id}/stages/{stageId}": {
        patch: write("Update job stage", "updateJobStage", "stages:write", [idParam, stageIdParam]),
      },
      "/candidates": {
        get: read("List candidates", "listCandidates", "candidates:read", listParams),
        post: post("Create candidate", "createCandidate", "candidates:write", [], "201"),
      },
      "/candidates/{id}": {
        get: read("Get candidate", "getCandidate", "candidates:read", [idParam]),
        patch: write("Update candidate", "updateCandidate", "candidates:write", [idParam]),
        delete: write("Delete candidate", "deleteCandidate", "candidates:write", [idParam]),
      },
      "/candidates/{id}/notes": {
        get: read("List candidate notes", "listCandidateNotes", "notes:read", [idParam]),
        post: post("Create candidate note", "createCandidateNote", "notes:write", [idParam], "201"),
      },
      "/candidates/{id}/tags": {
        get: read("List candidate tags", "listCandidateTags", "tags:read", [idParam]),
        post: post("Add candidate tag", "addCandidateTag", "tags:write", [idParam], "201"),
      },
      "/candidates/{id}/tags/{tagId}": {
        delete: write("Remove candidate tag", "removeCandidateTag", "tags:write", [idParam, tagIdParam]),
      },
      "/candidates/{id}/files": {
        get: read("List candidate file metadata", "listCandidateFiles", "files:read", [idParam]),
      },
      "/applications": {
        get: read("List applications", "listApplications", "applications:read", listParams),
        post: post("Create application", "createApplication", "applications:write", [], "201"),
      },
      "/applications/{id}": { get: read("Get application", "getApplication", "applications:read", [idParam]) },
      "/applications/{id}/move": { post: post("Move application stage", "moveApplication", "applications:write", [idParam]) },
      "/applications/{id}/reject": { post: post("Reject application", "rejectApplication", "applications:write", [idParam]) },
      "/applications/{id}/hire": { post: post("Hire application", "hireApplication", "applications:write", [idParam]) },
      "/applications/bulk": {
        post: post("Create applications in bulk", "createApplicationsBulk", "applications:write", [], "201"),
      },
      "/interviews": {
        get: read("List interviews", "listInterviews", "interviews:read", listParams),
        post: post("Schedule interview", "createInterview", "interviews:write", [], "201"),
      },
      "/interviews/{id}": {
        get: read("Get interview", "getInterview", "interviews:read", [idParam]),
        patch: write("Update interview", "updateInterview", "interviews:write", [idParam]),
      },
      "/interviews/{id}/cancel": { post: post("Cancel interview", "cancelInterview", "interviews:write", [idParam]) },
      "/interviews/{id}/complete": { post: post("Complete interview", "completeInterview", "interviews:write", [idParam]) },
      "/offers": {
        get: read("List offers", "listOffers", "offers:read", listParams),
        post: post("Create draft offer", "createOffer", "offers:write", [], "201"),
      },
      "/offers/{id}": {
        get: read("Get offer", "getOffer", "offers:read", [idParam]),
        patch: write("Update draft offer", "updateOffer", "offers:write", [idParam]),
      },
      "/offers/{id}/send": { post: post("Send offer", "sendOffer", "offers:write", [idParam]) },
      "/offers/{id}/decision": { post: post("Decide offer", "decideOffer", "offers:write", [idParam]) },
      "/offers/{id}/withdraw": { post: post("Withdraw offer", "withdrawOffer", "offers:write", [idParam]) },
      "/scorecards": {
        get: read("List scorecards", "listScorecards", "scorecards:read", listParams),
        post: post("Create scorecard", "createScorecard", "scorecards:write", [], "201"),
      },
      "/tasks": {
        get: read("List tasks", "listTasks", "tasks:read", listParams),
        post: post("Create task", "createTask", "tasks:write", [], "201"),
      },
      "/tasks/{id}": {
        get: read("Get task", "getTask", "tasks:read", [idParam]),
        patch: write("Update task", "updateTask", "tasks:write", [idParam]),
        delete: write("Delete task", "deleteTask", "tasks:write", [idParam]),
      },
      "/pool-entries": {
        get: read("List talent pool entries", "listPoolEntries", "pool:read", listParams),
        post: post("Create talent pool entry", "createPoolEntry", "pool:write", [], "201"),
      },
      "/pool-entries/{id}": { delete: write("Remove talent pool entry", "deletePoolEntry", "pool:write", [idParam]) },
      "/pool-entries/{id}/assign": { post: post("Assign pool candidate", "assignPoolEntry", "pool:write", [idParam]) },
      "/activity-events": { get: read("List activity events", "listActivityEvents", "activity:read", listParams) },
      "/webhooks": {
        get: read("List webhook endpoints", "listWebhooks", "webhooks:manage"),
        post: post("Create webhook endpoint", "createWebhook", "webhooks:manage", [], "201"),
      },
      "/webhooks/{id}": {
        patch: write("Update webhook endpoint", "updateWebhook", "webhooks:manage", [idParam]),
        delete: write("Delete webhook endpoint", "deleteWebhook", "webhooks:manage", [idParam]),
      },
      "/webhooks/{id}/test": { post: post("Send test webhook", "testWebhook", "webhooks:manage", [idParam]) },
      "/webhooks/{id}/deliveries": { get: read("List webhook deliveries", "listWebhookDeliveries", "webhooks:read", [idParam, ...listParams]) },
      "/webhooks/{id}/deliveries/{deliveryId}/replay": { post: post("Replay webhook delivery", "replayWebhookDelivery", "webhooks:write", [idParam, deliveryIdParam], "202") },
      "/api-keys": {
        get: read("List API keys", "listApiKeys", "api_keys:read"),
        post: post("Create API key", "createApiKey", "api_keys:write", [], "201"),
      },
      "/api-keys/{id}": { delete: write("Revoke API key", "revokeApiKey", "api_keys:write", [idParam]) },
      "/api-keys/{id}/rotate": { post: post("Rotate API key", "rotateApiKey", "api_keys:write", [idParam], "201") },
      "/me": { get: operation({ summary: "Introspect current API key", operationId: "getCurrentApiKey" }) },
    },
  };

  return NextResponse.json(spec, {
    headers: { ...CORS_HEADERS, "Harly-API-Version": "1.0.0" },
  });
}
