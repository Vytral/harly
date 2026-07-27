import "server-only";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import {
  ApiError,
  failure,
  success,
  type ApiErrorCode,
  type PaginationMeta,
} from "@harly/api";
import { getRequestRateLimit } from "@/server/api/auth";
import { releaseIdempotencyReservation } from "@/server/api/idempotency";
import {
  rateLimitResultFromError,
  type RateLimitResult,
} from "@/server/api/ratelimit";
import { createLogger } from "@/lib/logger";
import { recordHttpError, recordHttpRequest } from "@/server/observability/metrics";

const apiLog = createLogger("api");

/**
 * Transport layer for the REST API: turns service results / thrown ApiErrors
 * into JSON envelopes, and centralises CORS so public routes are embeddable.
 */

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Api-Key, Idempotency-Key",
  "Access-Control-Expose-Headers":
    "X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After, Harly-API-Version, Deprecation, Sunset",
  "Access-Control-Max-Age": "86400",
};

type RespondOptions = { cors?: boolean; status?: number };

function withHeaders(response: NextResponse, cors?: boolean): NextResponse {
  response.headers.set("Harly-API-Version", "1.0.0");
  // Do not guess a retirement date. Deployers can announce a future v2 with a
  // standards-compliant Sunset date without changing every route handler.
  const sunset = process.env.API_V1_SUNSET;
  if (sunset) {
    response.headers.set("Deprecation", "true");
    response.headers.set("Sunset", sunset);
  }
  if (cors) {
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      response.headers.set(key, value);
    }
  }
  return response;
}

function withRateLimitHeaders(
  response: NextResponse,
  rateLimit: RateLimitResult | null,
): NextResponse {
  if (!rateLimit) return response;
  response.headers.set("X-RateLimit-Limit", String(rateLimit.limit));
  response.headers.set("X-RateLimit-Remaining", String(rateLimit.remaining));
  response.headers.set(
    "X-RateLimit-Reset",
    String(Math.ceil(rateLimit.resetAt / 1000)),
  );
  if (response.status === 429) {
    response.headers.set(
      "Retry-After",
      String(Math.max(0, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))),
    );
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
  handler: (request: Request, context?: unknown) => Promise<Response>,
  options?: { cors?: boolean },
) {
  return async (request: Request, context?: unknown): Promise<NextResponse> => {
    const startedAt = performance.now();
    const route = new URL(request.url).pathname;
    const traceId = request.headers.get("x-request-id")?.slice(0, 128) || randomUUID();
    const attachTrace = (response: NextResponse) => {
      response.headers.set("X-Request-ID", traceId);
      return response;
    };
    try {
      const response = await handler(request, context);
      recordHttpRequest({ method: request.method, route, status: response.status, durationMs: performance.now() - startedAt });
      return withRateLimitHeaders(
        attachTrace(withHeaders(response as NextResponse, options?.cors)),
        getRequestRateLimit(request),
      );
    } catch (error) {
      await Promise.resolve(releaseIdempotencyReservation(request)).catch(
        (releaseError) => {
          console.error(
            "[api] failed to release idempotency reservation",
            releaseError,
          );
        },
      );
      const rateLimit =
        getRequestRateLimit(request) ?? rateLimitResultFromError(error);
      if (error instanceof ApiError) {
        recordHttpRequest({ method: request.method, route, status: error.status, durationMs: performance.now() - startedAt });
        return withRateLimitHeaders(
          attachTrace(apiError(error.code, error.message, {
            cors: options?.cors,
            details: error.details,
          })),
          rateLimit,
        );
      }
      // ZodError has an `issues` array , surface it as a 422 without coupling
      // this layer to a specific zod version.
      if (
        error &&
        typeof error === "object" &&
        "issues" in error &&
        Array.isArray((error as { issues: unknown[] }).issues)
      ) {
        return withRateLimitHeaders(
          attachTrace(apiError("unprocessable", "Validation failed.", {
            cors: options?.cors,
            details: (error as { issues: unknown[] }).issues,
          })),
          rateLimit,
        );
      }
      recordHttpError(route);
      recordHttpRequest({ method: request.method, route, status: 500, durationMs: performance.now() - startedAt });
      apiLog.error({ error, method: request.method, route, traceId }, "unhandled API route error");
      return withRateLimitHeaders(
        attachTrace(apiError("internal", "Something went wrong.", {
          cors: options?.cors,
        })),
        rateLimit,
      );
    }
  };
}
