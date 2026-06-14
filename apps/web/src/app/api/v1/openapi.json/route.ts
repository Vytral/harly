import { NextResponse } from "next/server";

import { API_SCOPES } from "@harly/api";

import { WEBHOOK_EVENTS } from "@/server/webhooks/events";
import { CORS_HEADERS } from "@/server/api/respond";

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

const listParams = [
  { name: "limit", in: "query", schema: { type: "integer", maximum: 100 } },
  { name: "cursor", in: "query", schema: { type: "string" } },
] as const;

/** GET /api/v1/openapi.json — OpenAPI 3.1 description of the REST API. */
export function GET() {
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Harly ATS API",
      version: "1.0.0",
      description:
        "Public REST API for the Harly / OpenHire ATS. Authenticate with a secret key (`Authorization: Bearer harly_sk_...`). Publishable keys (`harly_pk_...`) power the public job board + apply endpoints.",
    },
    servers: [{ url: `${baseUrl()}/api/v1` }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "harly_sk" },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                details: {},
              },
            },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    "x-scopes": API_SCOPES,
    "x-webhook-events": WEBHOOK_EVENTS,
    paths: {
      "/jobs": {
        get: { summary: "List jobs", parameters: [...listParams], responses: { "200": { description: "OK" } } },
        post: { summary: "Create job", responses: { "201": { description: "Created" } } },
      },
      "/jobs/{id}": {
        get: { summary: "Get job", parameters: [idParam], responses: { "200": { description: "OK" } } },
        patch: { summary: "Update job", parameters: [idParam], responses: { "200": { description: "OK" } } },
        delete: { summary: "Delete job", parameters: [idParam], responses: { "200": { description: "OK" } } },
      },
      "/jobs/{id}/publish": {
        post: { summary: "Publish job", parameters: [idParam], responses: { "200": { description: "OK" } } },
      },
      "/jobs/{id}/close": {
        post: { summary: "Close job", parameters: [idParam], responses: { "200": { description: "OK" } } },
      },
      "/candidates": {
        get: { summary: "List candidates", parameters: [...listParams], responses: { "200": { description: "OK" } } },
        post: { summary: "Create candidate", responses: { "201": { description: "Created" } } },
      },
      "/candidates/{id}": {
        get: { summary: "Get candidate", parameters: [idParam], responses: { "200": { description: "OK" } } },
        patch: { summary: "Update candidate", parameters: [idParam], responses: { "200": { description: "OK" } } },
        delete: { summary: "Delete candidate", parameters: [idParam], responses: { "200": { description: "OK" } } },
      },
      "/applications": {
        get: { summary: "List applications", parameters: [...listParams], responses: { "200": { description: "OK" } } },
        post: { summary: "Create application", responses: { "201": { description: "Created" } } },
      },
      "/applications/{id}": {
        get: { summary: "Get application", parameters: [idParam], responses: { "200": { description: "OK" } } },
      },
      "/applications/{id}/move": {
        post: { summary: "Move application stage", parameters: [idParam], responses: { "200": { description: "OK" } } },
      },
      "/applications/{id}/reject": {
        post: { summary: "Reject application", parameters: [idParam], responses: { "200": { description: "OK" } } },
      },
      "/applications/{id}/hire": {
        post: { summary: "Hire application", parameters: [idParam], responses: { "200": { description: "OK" } } },
      },
      "/webhooks": {
        get: { summary: "List webhook endpoints", responses: { "200": { description: "OK" } } },
        post: { summary: "Create webhook endpoint", responses: { "201": { description: "Created" } } },
      },
      "/webhooks/{id}": {
        patch: { summary: "Update webhook endpoint", parameters: [idParam], responses: { "200": { description: "OK" } } },
        delete: { summary: "Delete webhook endpoint", parameters: [idParam], responses: { "200": { description: "OK" } } },
      },
      "/webhooks/{id}/test": {
        post: { summary: "Send test webhook", parameters: [idParam], responses: { "200": { description: "OK" } } },
      },
      "/me": {
        get: { summary: "Introspect the current API key", responses: { "200": { description: "OK" } } },
      },
    },
  };

  return NextResponse.json(spec, { headers: CORS_HEADERS });
}
