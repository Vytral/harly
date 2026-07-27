import { NextResponse } from "next/server";
import { z } from "zod";

import { API_SCOPES } from "@harly/api";

import { apiContracts } from "@/server/api/contracts/registry";
import { jsonSchema } from "@/server/api/contracts";
import { CORS_HEADERS } from "@/server/api/respond";

export const runtime = "nodejs";

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

function parameterList(contract: (typeof apiContracts)[number]) {
  const parameters: Record<string, unknown>[] = [];
  for (const [location, schema] of Object.entries(contract.parameters ?? {})) {
    const shape = schema.shape;
    for (const [name, field] of Object.entries(shape)) {
      const schema = field as z.ZodTypeAny;
      parameters.push({
        name,
        in: location,
        required: !(schema.isOptional?.() ?? false),
        schema: jsonSchema(schema),
      });
    }
  }
  return parameters;
}

function responseEntry(
  def:
    | {
        description?: string;
        examples?: Record<string, { summary?: string; value: unknown }>;
        schema?: z.ZodTypeAny;
      }
    | z.ZodTypeAny,
) {
  const schema = "schema" in def ? def.schema : def;
  if (!schema || !("safeParse" in schema)) {
    throw new Error("OpenAPI response schema is missing.");
  }
  const response =
    def && "schema" in def
      ? def
      : { description: undefined, examples: undefined };
  return {
    description: response.description ?? "OK",
    content: {
      "application/json": {
        schema: jsonSchema(schema),
        ...(response.examples ? { examples: response.examples } : {}),
      },
    },
  };
}

export const GET = () => {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const contract of apiContracts) {
    const method = contract.method.toLowerCase();
    paths[contract.path] ??= {};
    paths[contract.path][method] = {
      summary: contract.summary,
      description: contract.description,
      operationId: contract.operationId,
      tags: contract.tags ?? [],
      parameters: parameterList(contract),
      responses: Object.fromEntries(
        Object.entries(contract.responses).map(([status, def]) => [
          status,
          responseEntry(def),
        ]),
      ),
      ...(contract.requestBody
        ? {
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: jsonSchema(
                    "schema" in contract.requestBody
                      ? contract.requestBody.schema
                      : contract.requestBody,
                  ),
                },
              },
            },
          }
        : {}),
      ...(contract.auth?.scopes?.length
        ? {
            security: [{ bearerAuth: [] }],
            "x-harly-required-scopes": contract.auth.scopes,
          }
        : {}),
    };
  }

  const document = {
    openapi: "3.1.0",
    info: {
      title: "Harly API",
      version: process.env.HARLY_VERSION ?? "1.0.0",
    },
    servers: [{ url: baseUrl() }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "Harly API key",
        },
      },
      schemas: {},
      headers: {
        ...Object.fromEntries(
          ["jobs:read", "jobs:write", "stages:read", "stages:write"].map(
            (scope) => [scope, { schema: { type: "string" } }],
          ),
        ),
      },
      "x-harly-api-scopes": API_SCOPES,
    },
  };

  return NextResponse.json(document, { headers: CORS_HEADERS });
};
