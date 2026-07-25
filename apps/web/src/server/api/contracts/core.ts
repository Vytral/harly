import { z } from "zod";
import { NextResponse } from "next/server";

import { ApiError, type ApiScope } from "@harly/api";
import { authenticateApiKey, type ApiKeyContext } from "@/server/api/auth";
import {
  reserveIdempotencyKey,
  releaseIdempotencyReservation,
} from "@/server/api/idempotency";

export type ContractResponse<T extends z.ZodTypeAny = z.ZodTypeAny> = {
  description?: string;
  schema: T;
  examples?: Record<string, { summary?: string; value: unknown }>;
};

export type ContractRequestBody<T extends z.ZodTypeAny = z.ZodTypeAny> = {
  description?: string;
  schema: T;
  examples?: Record<string, { summary?: string; value: unknown }>;
};

export type ContractDefinition = {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  operationId: string;
  summary: string;
  description?: string;
  tags?: string[];
  auth?: { scopes: ApiScope[] };
  idempotent?: boolean;
  parameters?: {
    path?: z.ZodObject<z.ZodRawShape>;
    query?: z.ZodObject<z.ZodRawShape>;
    headers?: z.ZodObject<z.ZodRawShape>;
  };
  requestBody?: ContractRequestBody | z.ZodTypeAny;
  responses: Record<number, ContractResponse | z.ZodTypeAny>;
};

export type RouteContext<TParams = Record<string, string>> = {
  params?: Promise<TParams> | TParams;
};

export type RouteHandlerInput<TParams, TQuery, TBody> = {
  request: Request;
  params: TParams;
  query: TQuery;
  body: TBody;
  auth: ApiKeyContext;
};

export type RouteHandler<TParams, TQuery, TBody> = (
  input: RouteHandlerInput<TParams, TQuery, TBody>,
) => Promise<Response>;

function unwrapSchema<T extends z.ZodTypeAny>(
  value: T | ContractRequestBody<T>,
): T {
  return "schema" in value ? value.schema : value;
}

export function defineContract<const T extends ContractDefinition>(
  contract: T,
): T {
  return contract;
}

function parseObject<T extends z.ZodObject<z.ZodRawShape> | undefined>(
  schema: T,
  raw: Record<string, string>,
): z.infer<NonNullable<T>> {
  if (!schema) return {} as z.infer<NonNullable<T>>;
  const parsed = {} as Record<string, unknown>;
  for (const [key, field] of Object.entries(schema.shape)) {
    const value = raw[key];
    if (value === undefined) continue;
    if (field instanceof z.ZodNumber) {
      parsed[key] = Number(value);
      continue;
    }
    if (field instanceof z.ZodBoolean) {
      parsed[key] = value === "true";
      continue;
    }
    parsed[key] = value;
  }
  return schema.parse(parsed) as z.infer<NonNullable<T>>;
}

async function parseBody(
  request: Request,
  bodySchema?: ContractRequestBody | z.ZodTypeAny,
) {
  if (!bodySchema) return undefined;
  if (request.method === "GET" || request.method === "DELETE") return undefined;
  const json = await request.json().catch(() => null);
  return unwrapSchema(bodySchema).parse(json);
}

export function buildRouteHandler<
  TContract extends ContractDefinition,
  TParams extends Record<string, string> = Record<string, string>,
  TQuery = unknown,
  TBody = unknown,
>(contract: TContract, handler: RouteHandler<TParams, TQuery, TBody>) {
  return (async (
    request: Request,
    context: RouteContext<TParams> = {},
  ): Promise<Response> => {
    try {
      const auth = await authenticateApiKey(
        request,
        contract.auth?.scopes?.[0],
      );
      if (contract.auth?.scopes) {
        for (const scope of contract.auth.scopes.slice(1)) {
          if (!auth.scopes.includes(scope)) {
            throw ApiError.forbidden(
              `This key is missing the \`${scope}\` scope.`,
            );
          }
        }
      }

      const idempotency =
        contract.method === "POST" && contract.idempotent
          ? await reserveIdempotencyKey(request, auth, { path: contract.path })
          : null;
      if (idempotency?.kind === "replay") {
        return NextResponse.json(idempotency.response.body, {
          status: idempotency.response.status,
        });
      }

      const params = parseObject(contract.parameters?.path, {
        ...(await Promise.resolve(context.params ?? {})),
      } as Record<string, string>);
      const query = parseObject(
        contract.parameters?.query,
        Object.fromEntries(new URL(request.url).searchParams.entries()),
      );
      const body = (await parseBody(request, contract.requestBody)) as TBody;

      const response = await handler({
        request,
        params,
        query,
        body,
        auth,
      } as RouteHandlerInput<TParams, TQuery, TBody>);

      if (idempotency?.kind === "reserved") {
        await idempotency.complete({
          status: response.status,
          body: await response.clone().json(),
        });
      }
      return response;
    } catch (error) {
      await Promise.resolve(releaseIdempotencyReservation(request)).catch(
        () => undefined,
      );
      throw error;
    }
  }) as unknown as (request: Request, context?: unknown) => Promise<Response>;
}

export function jsonSchema(schema: z.ZodTypeAny) {
  const converted = z.toJSONSchema(schema, { unrepresentable: "any" });
  const rest = { ...(converted as Record<string, unknown>) };
  delete rest.$schema;
  return rest;
}
