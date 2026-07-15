import { NextResponse, type NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";

import { sql } from "@harly/db";

import { getServerLogger } from "@/lib/logger";

const log = getServerLogger();

/** Constant-time secret comparison to avoid timing side-channels. */
function safeEqual(a: string, b: string): boolean {
  const ab = createHash("sha256").update(a, "utf8").digest();
  const bb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ab, bb);
}

/**
 * Derive a stable pair of signed 32-bit keys for the two-argument
 * `pg_advisory_lock(int, int)` from a cron name. SHA-256 keeps the mapping
 * deterministic across processes and replicas, and 32-bit ints stay within the
 * serializable parameter range (unlike bigint).
 */
function advisoryKey(name: string): [number, number] {
  const digest = createHash("sha256").update(name).digest();
  return [digest.readInt32BE(0), digest.readInt32BE(4)];
}

export type CronAuthResult =
  | { ok: false; response: NextResponse }
  | { ok: true; release: () => Promise<void> };

/**
 * Authorize a cron request via `CRON_SECRET` (Authorization: Bearer only) and
 * guarantee a single concurrent execution per key across all app/scheduler
 * replicas using a PostgreSQL advisory lock.
 *
 * On success returns `{ ok: true, release }`; the caller MUST call `release()`
 * in a `finally` block to free the lock and return the connection to the pool.
 * On failure returns `{ ok: false, response }` to short-circuit the handler.
 */
export async function authorizeCron(
  request: NextRequest,
  key: string,
): Promise<CronAuthResult> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "CRON_SECRET is not configured." },
        { status: 503 },
      ),
    };
  }

  // Bearer token only. Query-string secrets are rejected because they leak into
  // access logs, proxy logs, and browser history (F2-06).
  const auth = request.headers.get("authorization");
  const supplied = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;

  if (!supplied || !safeEqual(supplied, secret)) {
    // Do not echo the secret or the supplied value into logs/response.
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  const [keyHi, keyLo] = advisoryKey(key);
  const connection = await sql.reserve();
  try {
    const rows = await connection`
      select pg_try_advisory_lock(${keyHi}, ${keyLo}) as locked
    `;
    if (!rows[0]?.locked) {
      connection.release();
      log.warn({ cron: key }, "cron already running; skipping overlap");
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Already running." },
          { status: 409 },
        ),
      };
    }
  } catch (error) {
    connection.release();
    throw error;
  }

  const release = async () => {
    try {
      await connection`select pg_advisory_unlock(${keyHi}, ${keyLo})`;
    } catch (error) {
      log.error(error, "failed to release cron advisory lock");
    } finally {
      connection.release();
    }
  };

  return { ok: true, release };
}
