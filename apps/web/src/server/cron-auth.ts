import { NextResponse, type NextRequest } from "next/server";

import { getServerLogger } from "@/lib/logger";

const log = getServerLogger();

/** Constant-time secret comparison to avoid timing side-channels. */
function safeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) {
    // Still run a comparison so timing doesn't short-circuit on length.
    return timingSafeEqual(ab, ab) && false;
  }
  return timingSafeEqual(ab, bb);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const running = new Set<string>();

/**
 * Authorize a cron request via `CRON_SECRET` (Authorization: Bearer only) and
 * guarantee a single concurrent execution per key. Returns a `NextResponse` to
 * short-circuit when unauthorized or already running, otherwise `null` and
 * leaves the caller to release the lock via `releaseCronLock`.
 */
export function authorizeCron(
  request: NextRequest,
  key: string,
): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 503 },
    );
  }

  const auth = request.headers.get("authorization");
  const supplied = auth?.startsWith("Bearer ")
    ? auth.slice(7).trim()
    : request.nextUrl.searchParams.get("secret");

  if (!supplied || !safeEqual(supplied, secret)) {
    // Do not echo the secret or the supplied value into logs/response.
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (running.has(key)) {
    log.warn({ cron: key }, "cron already running; skipping overlap");
    return NextResponse.json({ error: "Already running." }, { status: 409 });
  }

  running.add(key);
  return null;
}

export function releaseCronLock(key: string): void {
  running.delete(key);
}
