import "server-only";

import { ApiError } from "@harly/api";

/**
 * In-memory fixed-window rate limiter. Zero-dependency and correct for a single
 * instance (the default self-host topology). Multi-instance / cloud deploys
 * should front this with a shared store — see the trade-offs in the plan. The
 * counter map is process-global and survives across requests via globalThis.
 */
type Bucket = { count: number; resetAt: number };

const globalForRateLimit = globalThis as unknown as {
  harlyRateBuckets?: Map<string, Bucket>;
};

const buckets =
  globalForRateLimit.harlyRateBuckets ??
  (globalForRateLimit.harlyRateBuckets = new Map<string, Bucket>());

export type RateLimitOptions = {
  /** Max requests allowed within the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
};

/**
 * Throws `ApiError.rateLimited()` when `key` exceeds `limit` within `windowMs`.
 * Returns remaining quota otherwise.
 */
export function enforceRateLimit(
  key: string,
  options: RateLimitOptions,
): { remaining: number; resetAt: number } {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + options.windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { remaining: options.limit - 1, resetAt };
  }

  if (existing.count >= options.limit) {
    throw ApiError.rateLimited(
      "Rate limit exceeded. Slow down and try again shortly.",
    );
  }

  existing.count += 1;
  return { remaining: options.limit - existing.count, resetAt: existing.resetAt };
}

/** Best-effort client IP from proxy headers (works behind Vercel / nginx). */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
