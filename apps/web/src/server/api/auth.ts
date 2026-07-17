import "server-only";

import { eq } from "drizzle-orm";

import {
  ApiError,
  hashApiKey,
  isApiScope,
  parseApiKey,
  type ApiKeyType,
  type ApiScope,
} from "@harly/api";
import { db, apiKeys } from "@harly/db";
import { enforceRateLimit } from "@/server/api/ratelimit";

export type ApiKeyContext = {
  workspaceId: string;
  keyId: string;
  type: ApiKeyType;
  environment: "live" | "test";
  scopes: ApiScope[];
};

const LAST_USED_THROTTLE_MS = 60_000;

// Per-key budget so a single API key can't abuse the developer API (F2-07).
const API_KEY_RATE_LIMIT = 1000;
const API_KEY_RATE_WINDOW_MS = 10 * 60_000;

/** Pull the presented key from the standard places. */
function extractKey(request: Request): { raw: string; fromQuery: boolean } | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    return { raw: auth.slice(7).trim(), fromQuery: false };
  }
  const headerKey = request.headers.get("x-api-key");
  if (headerKey) {
    return { raw: headerKey.trim(), fromQuery: false };
  }
  // Publishable keys may travel as a query param (the embed widget runs in the
  // browser and can't always set headers on a cross-origin GET).
  const url = new URL(request.url);
  const pk = url.searchParams.get("pk");
  if (pk) {
    return { raw: pk.trim(), fromQuery: true };
  }
  return null;
}

/**
 * Authenticate an API key and (optionally) assert a required scope.
 *
 * Secret keys (sk_) must be sent in a header , never accepted from the query
 * string to avoid leaking them into logs / referrers. Publishable keys (pk_)
 * are accepted from either.
 */
export async function authenticateApiKey(
  request: Request,
  requiredScope?: ApiScope,
): Promise<ApiKeyContext> {
  const presented = extractKey(request);
  if (!presented) {
    throw ApiError.unauthorized("Missing API key.");
  }

  const meta = parseApiKey(presented.raw);
  if (!meta) {
    throw ApiError.unauthorized("Malformed API key.");
  }

  if (meta.type === "secret" && presented.fromQuery) {
    throw ApiError.unauthorized(
      "Secret keys must be sent in the Authorization header, not the URL.",
    );
  }

  const [row] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.hashedKey, hashApiKey(presented.raw)))
    .limit(1);

  if (!row) {
    throw ApiError.unauthorized("Invalid API key.");
  }
  if (row.revokedAt) {
    throw ApiError.unauthorized("This API key has been revoked.");
  }
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
    throw ApiError.unauthorized("This API key has expired.");
  }

  const scopes = (Array.isArray(row.scopes) ? row.scopes : []).filter(
    (value): value is ApiScope => typeof value === "string" && isApiScope(value),
  );

  if (requiredScope && !scopes.includes(requiredScope)) {
    throw ApiError.forbidden(
      `This key is missing the \`${requiredScope}\` scope.`,
    );
  }

  // Per-key rate limit (F2-07): each key gets its own budget, enforced before
  // any work is done. This is what the in-memory limiter on public routes
  // didn't cover for authenticated API keys.
  enforceRateLimit(`apikey:${row.id}`, {
    limit: API_KEY_RATE_LIMIT,
    windowMs: API_KEY_RATE_WINDOW_MS,
  });

  // Throttled last-used stamp; fire-and-forget so it never blocks the request.
  if (
    !row.lastUsedAt ||
    Date.now() - row.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS
  ) {
    void db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, row.id))
      .catch(() => undefined);
  }

  return {
    workspaceId: row.workspaceId,
    keyId: row.id,
    type: row.type as ApiKeyType,
    environment: row.environment as "live" | "test",
    scopes,
  };
}

/** Assert a scope on an already-authenticated context. */
export function requireScope(context: ApiKeyContext, scope: ApiScope): void {
  if (!context.scopes.includes(scope)) {
    throw ApiError.forbidden(`This key is missing the \`${scope}\` scope.`);
  }
}
