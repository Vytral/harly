import "server-only";

import { NextResponse } from "next/server";

import {
  ApiError,
  failure,
  success,
  type ApiErrorCode,
  type PaginationMeta,
} from "@harly/api";

/**
 * Transport layer for the REST API: turns service results / thrown ApiErrors
 * into JSON envelopes, and centralises CORS so public routes are embeddable.
 */

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key",
  "Access-Control-Max-Age": "86400",
};

type RespondOptions = { cors?: boolean; status?: number };

function withHeaders(response: NextResponse, cors?: boolean): NextResponse {
  if (cors) {
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      response.headers.set(key, value);
    }
  }
  return response;
}

export function withCors(response: NextResponse): NextResponse {
  return withHeaders(response, true);
}

export function apiOk<T>(
  data: T,
  options?: RespondOptions & { pagination?: PaginationMeta },
): NextResponse {
  const meta = options?.pagination
    ? { pagination: options.pagination }
    : undefined;
  return withHeaders(
    NextResponse.json(success(data, meta), { status: options?.status ?? 200 }),
    options?.cors,
  );
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  options?: RespondOptions & { details?: unknown },
): NextResponse {
  const status = options?.status ?? new ApiError(code, message).status;
  return withHeaders(
    NextResponse.json(failure(code, message, options?.details), { status }),
    options?.cors,
  );
}

/** Preflight handler , export as `OPTIONS` from any CORS-enabled route. */
export function corsPreflight(): NextResponse {
  return withHeaders(new NextResponse(null, { status: 204 }), true);
}

/**
 * Wrap a route handler so thrown `ApiError`s (and unknown errors) render as the
 * standard error envelope. Pass `{ cors: true }` for public routes.
 */
export function withApi(
  handler: (request: Request, context: unknown) => Promise<NextResponse>,
  options?: { cors?: boolean },
) {
  return async (request: Request, context: unknown): Promise<NextResponse> => {
    try {
      const response = await handler(request, context);
      return withHeaders(response, options?.cors);
    } catch (error) {
      if (error instanceof ApiError) {
        return apiError(error.code, error.message, {
          cors: options?.cors,
          details: error.details,
        });
      }
      // ZodError has an `issues` array , surface it as a 422 without coupling
      // this layer to a specific zod version.
      if (
        error &&
        typeof error === "object" &&
        "issues" in error &&
        Array.isArray((error as { issues: unknown[] }).issues)
      ) {
        return apiError("unprocessable", "Validation failed.", {
          cors: options?.cors,
          details: (error as { issues: unknown[] }).issues,
        });
      }
      console.error("[api] unhandled route error", error);
      return apiError("internal", "Something went wrong.", {
        cors: options?.cors,
      });
    }
  };
}
