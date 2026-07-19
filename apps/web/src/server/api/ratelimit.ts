import "server-only";

import { eq } from "drizzle-orm";

import { ApiError } from "@harly/api";
import { db, rateLimitBuckets } from "@harly/db";

/**
 * Rate limiting. Fixed-window counters, pluggable store:
 *
 * - `MemoryStore` (default): correct for a single instance , the default
 *   self-host topology. Zero dependencies.
 * - `DatabaseStore`: shared across instances (horizontal scaling / multiple
 *   server processes) using the existing Postgres, with row-level locking so
 *   the window is enforced atomically. Enable with `RATE_LIMIT_STORE=database`.
 */
type Bucket = { count: number; resetAt: number };

/** Quota state for the request that just consumed a slot. */
export type RateLimitResult = {
  limit: number;
  remaining: number;
  resetAt: number;
};

type RateLimitErrorDetails = { rateLimit: RateLimitResult };

export interface RateLimitStore {
  /** Consume one slot for `key`; throws `ApiError.rateLimited` when exhausted. */
  consume(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitResult>;
}

export type RateLimitOptions = {
  /** Max requests allowed within the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
};

const RATE_LIMITED_MESSAGE =
  "Rate limit exceeded. Slow down and try again shortly.";

function rateLimitExceeded(limit: number, resetAt: number): ApiError {
  return new ApiError("rate_limited", RATE_LIMITED_MESSAGE, {
    rateLimit: { limit, remaining: 0, resetAt },
  } satisfies RateLimitErrorDetails);
}

/** Read quota state attached to a rate-limit rejection, if present. */
export function rateLimitResultFromError(
  error: unknown,
): RateLimitResult | null {
  if (!(error instanceof ApiError) || error.code !== "rate_limited")
    return null;
  const details = error.details;
  if (!details || typeof details !== "object" || !("rateLimit" in details)) {
    return null;
  }
  const value = details.rateLimit;
  if (!value || typeof value !== "object") {
    return null;
  }
  const rateLimit = value as Record<string, unknown>;
  if (
    typeof rateLimit.limit !== "number" ||
    typeof rateLimit.remaining !== "number" ||
    typeof rateLimit.resetAt !== "number"
  ) {
    return null;
  }
  return rateLimit as RateLimitResult;
}

export class MemoryStore implements RateLimitStore {
  private buckets = new Map<string, Bucket>();

  async consume(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const existing = this.buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      const resetAt = now + windowMs;
      this.buckets.set(key, { count: 1, resetAt });
      return { limit, remaining: limit - 1, resetAt };
    }

    if (existing.count >= limit) {
      throw rateLimitExceeded(limit, existing.resetAt);
    }

    existing.count += 1;
    return {
      limit,
      remaining: limit - existing.count,
      resetAt: existing.resetAt,
    };
  }
}

export class DatabaseStore implements RateLimitStore {
  async consume(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitResult> {
    return db.transaction(async (tx) => {
      const now = Date.now();
      const [row] = await tx
        .select()
        .from(rateLimitBuckets)
        .where(eq(rateLimitBuckets.key, key))
        .for("update")
        .limit(1);

      if (!row || row.resetAt.getTime() <= now) {
        const resetAt = new Date(now + windowMs);
        await tx
          .insert(rateLimitBuckets)
          .values({ key, count: 1, resetAt })
          .onConflictDoUpdate({
            target: rateLimitBuckets.key,
            set: { count: 1, resetAt, updatedAt: new Date() },
          });
        return { limit, remaining: limit - 1, resetAt: resetAt.getTime() };
      }

      if (row.count >= limit) {
        throw rateLimitExceeded(limit, row.resetAt.getTime());
      }

      const next = row.count + 1;
      await tx
        .update(rateLimitBuckets)
        .set({ count: next, updatedAt: new Date() })
        .where(eq(rateLimitBuckets.key, key));
      return { limit, remaining: limit - next, resetAt: row.resetAt.getTime() };
    });
  }
}

const memoryStore = new MemoryStore();
const databaseStore = new DatabaseStore();

function defaultStore(): RateLimitStore {
  return process.env.RATE_LIMIT_STORE === "database"
    ? databaseStore
    : memoryStore;
}

/**
 * Consumes one slot for `key` within `options`. Throws `ApiError.rateLimited()`
 * when the window is exhausted. Returns the remaining quota otherwise.
 */
export function enforceRateLimit(
  key: string,
  options: RateLimitOptions,
  store: RateLimitStore = defaultStore(),
): Promise<RateLimitResult> {
  return store.consume(key, options.limit, options.windowMs);
}

/**
 * Best-effort client IP from proxy headers (works behind Vercel / nginx).
 *
 * The LEFTmost `x-forwarded-for` value is attacker-controllable, so by default
 * we use the RIGHTmost address , the hop closest to our edge, which a fronting
 * proxy controls. Self-hosters who terminate TLS at a trusted proxy may set
 * TRUSTED_PROXY_IPS (comma-separated) to opt into using the leftmost (original
 * client) address instead; requests not from a trusted proxy still fall back to
 * the rightmost hop.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");

  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
    if (hops.length > 0) {
      const trusted = (process.env.TRUSTED_PROXY_IPS ?? "")
        .split(",")
        .map((h) => h.trim())
        .filter(Boolean);
      const peerIp = request.headers.get("x-forwarded-peer") ?? realIp ?? null;

      if (trusted.length > 0 && peerIp && trusted.includes(peerIp)) {
        return hops[0]; // trusted proxy -> original client is leftmost
      }
      return hops[hops.length - 1]; // otherwise use the edge hop
    }
  }

  return realIp ?? "unknown";
}
