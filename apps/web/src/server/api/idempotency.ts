import "server-only";

import { createHash } from "node:crypto";

import { and, eq, lt } from "drizzle-orm";

import { ApiError } from "@harly/api";
import { apiIdempotencyKeys, db } from "@harly/db";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1_000;
const PROCESSING_LEASE_MS = 5 * 60 * 1_000;
const MAX_KEY_LENGTH = 255;

export type IdempotencyContext = {
  workspaceId: string;
  keyId: string;
};

export type StoredIdempotentResponse = {
  status: number;
  body: unknown;
};

export type IdempotencyResult =
  | { kind: "not_requested" }
  | {
      kind: "reserved";
      key: string;
      complete: (response: StoredIdempotentResponse) => Promise<void>;
    }
  | { kind: "replay"; key: string; response: StoredIdempotentResponse };

export type ReserveIdempotencyOptions = {
  /** Override only for tests or intentionally shorter-lived operations. */
  ttlMs?: number;
  /** Route identity; defaults to the request pathname. */
  path?: string;
};

// Route handlers reserve before their domain write. Keep a request-local
// release hook so `withApi` can discard a reservation when validation or the
// write fails; otherwise the same safe retry would be stuck as "processing".
const activeReservations = new WeakMap<Request, () => Promise<void>>();
// A few legacy handlers still call reserveIdempotencyKey themselves while the
// contract wrapper also reserves automatically. Cache the request-local result
// so both layers share one DB lease instead of hashing/claiming the body twice.
const requestReservations = new WeakMap<Request, IdempotencyResult>();

/** Release an unfinished reservation after a route handler fails. */
export async function releaseIdempotencyReservation(request: Request): Promise<void> {
  const release = activeReservations.get(request);
  if (!release) return;
  activeReservations.delete(request);
  requestReservations.delete(request);
  await release();
}

function idempotencyKeyFrom(request: Request): string | null {
  const value = request.headers.get("idempotency-key");
  if (value === null) return null;

  const key = value.trim();
  if (
    key.length === 0 ||
    key.length > MAX_KEY_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(key)
  ) {
    throw ApiError.badRequest(
      "Idempotency-Key must be 1 to 255 printable characters.",
    );
  }
  return key;
}

async function requestHash(request: Request): Promise<string> {
  const url = new URL(request.url);
  const body = Buffer.from(await request.clone().arrayBuffer());
  return createHash("sha256")
    .update(request.method)
    .update("\n")
    .update(url.pathname)
    .update(url.search)
    .update("\n")
    .update(body)
    .digest("hex");
}

function routePath(request: Request, path?: string): string {
  if (path) return path;
  return new URL(request.url).pathname;
}

/**
 * Reserve a durable idempotency key for a POST request.
 *
 * A new key returns `reserved`; after a successful write, call `complete()`
 * with the exact response envelope. A matching completed key returns `replay`.
 * Reusing a key for a different request, or while it is still running, throws
 * a 409 `ApiError`.
 *
 * A missing header intentionally returns `not_requested`, which keeps the
 * helper usable while endpoints migrate to mandatory Idempotency-Key support.
 */
export async function reserveIdempotencyKey(
  request: Request,
  context: IdempotencyContext,
  options: ReserveIdempotencyOptions = {},
): Promise<IdempotencyResult> {
  if (!(["POST", "PUT", "PATCH"] as const).includes(request.method as "POST" | "PUT" | "PATCH")) {
    throw ApiError.badRequest("Idempotency-Key is supported for POST, PUT, and PATCH requests.");
  }

  const key = idempotencyKeyFrom(request);
  if (!key) return { kind: "not_requested" };
  const cached = requestReservations.get(request);
  if (cached) return cached;

  const path = routePath(request, options.path);
  const hash = await requestHash(request);
  const now = new Date();
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new Error("Idempotency TTL must be a positive number.");
  }
  // An unfinished row is a lease, not a 24-hour lock. If a process dies after
  // committing the reservation, a matching client retry can reclaim it.
  const expiresAt = new Date(
    now.getTime() + Math.min(ttlMs, PROCESSING_LEASE_MS),
  );

  const reservation = await db.transaction(async (tx) => {
    // Deleting expired rows before claiming allows the same key to be reused
    // after its replay window. A previous worker cannot overwrite a new row:
    // `complete` targets the old row UUID.
    await tx
      .delete(apiIdempotencyKeys)
      .where(
        and(
          eq(apiIdempotencyKeys.apiKeyId, context.keyId),
          eq(apiIdempotencyKeys.method, request.method),
          eq(apiIdempotencyKeys.path, path),
          eq(apiIdempotencyKeys.idempotencyKey, key),
          lt(apiIdempotencyKeys.expiresAt, now),
        ),
      );

    const [created] = await tx
      .insert(apiIdempotencyKeys)
      .values({
        workspaceId: context.workspaceId,
        apiKeyId: context.keyId,
        method: request.method,
        path,
        idempotencyKey: key,
        requestHash: hash,
        expiresAt,
      })
      .onConflictDoNothing()
      .returning({ id: apiIdempotencyKeys.id });

    if (created) return { kind: "reserved" as const, id: created.id };

    const [existing] = await tx
      .select()
      .from(apiIdempotencyKeys)
      .where(
        and(
          eq(apiIdempotencyKeys.apiKeyId, context.keyId),
          eq(apiIdempotencyKeys.method, request.method),
          eq(apiIdempotencyKeys.path, path),
          eq(apiIdempotencyKeys.idempotencyKey, key),
        ),
      )
      .limit(1);

    if (!existing) {
      throw ApiError.internal("Could not reserve the idempotency key.");
    }
    if (existing.requestHash !== hash) {
      throw ApiError.conflict(
        "Idempotency-Key was already used with a different request.",
      );
    }
    if (existing.status !== "completed") {
      throw ApiError.conflict("A request with this Idempotency-Key is still processing.");
    }
    if (existing.responseStatus === null) {
      throw ApiError.internal("Idempotency record has no stored response.");
    }

    return {
      kind: "replay" as const,
      response: { status: existing.responseStatus, body: existing.responseBody },
    };
  });

  if (reservation.kind === "replay") {
    const result = { kind: "replay" as const, key, response: reservation.response };
    requestReservations.set(request, result);
    return result;
  }

  const release = async () => {
    await db
      .delete(apiIdempotencyKeys)
      .where(
        and(
          eq(apiIdempotencyKeys.id, reservation.id),
          eq(apiIdempotencyKeys.status, "processing"),
        ),
      );
  };
  activeReservations.set(request, release);

  let completed = false;
  const result: IdempotencyResult = {
    kind: "reserved",
    key,
    complete: async (response) => {
      if (completed) return;
      const [completedRow] = await db
        .update(apiIdempotencyKeys)
        .set({
          status: "completed",
          responseStatus: response.status,
          responseBody: response.body,
          expiresAt: new Date(Date.now() + ttlMs),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(apiIdempotencyKeys.id, reservation.id),
            eq(apiIdempotencyKeys.status, "processing"),
          ),
        )
        .returning({ id: apiIdempotencyKeys.id });

      if (!completedRow) {
        throw ApiError.internal("Could not persist the idempotent response.");
      }
      completed = true;
      activeReservations.delete(request);
    },
  };
  requestReservations.set(request, result);
  return result;
}

/** Delete expired keys. Safe for a scheduled cleanup job; not required per request. */
export async function deleteExpiredIdempotencyKeys(now = new Date()): Promise<number> {
  const deleted = await db
    .delete(apiIdempotencyKeys)
    .where(lt(apiIdempotencyKeys.expiresAt, now))
    .returning({ id: apiIdempotencyKeys.id });
  return deleted.length;
}
