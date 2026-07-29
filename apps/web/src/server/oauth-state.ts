import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db, oauthStateNonces } from "@harly/db";

import { getServerLogger } from "@/lib/logger";

const log = getServerLogger();

const STATE_MAX_AGE_MS = 10 * 60 * 1000;
const NONCE_BYTES = 32;

function getSigningKey(): string {
  return process.env.AI_ENCRYPTION_KEY ?? "fallback-dev-only";
}

/** HMAC-sign a base64url payload so its integrity can be verified later. */
export function signState(payloadB64: string): string {
  return createHmac("sha256", getSigningKey()).update(payloadB64).digest("base64url");
}

export function buildSignedState(payload: Record<string, unknown>): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadB64}.${signState(payloadB64)}`;
}

/** Verify the HMAC of a `payload.sig` state string; return the payload or null. */
export function verifySignedState(state: string): Record<string, unknown> | null {
  const [payloadB64, sig] = state.split(".");
  if (!payloadB64 || !sig) return null;
  const expected = signState(payloadB64);
  // constant-time compare to avoid timing side-channels
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Create a server-side nonce for an integration OAuth install, bound to the
 * acting user + workspace. Returns the signed state string to send to the
 * provider. The nonce is single-use and expires after STATE_MAX_AGE_MS.
 */
export async function createOauthStateNonce(input: {
  userId: string;
  workspaceId: string;
  provider: string;
}): Promise<string> {
  const nonce = randomBytes(NONCE_BYTES).toString("hex");
  // An install flow needs only one redeemable nonce per actor/workspace/provider.
  // Replacing stale/pending rows prevents an authorized user from turning the
  // install endpoint into an unbounded durable-write primitive.
  await db.delete(oauthStateNonces).where(or(
    lt(oauthStateNonces.expiresAt, new Date()),
    and(
      eq(oauthStateNonces.userId, input.userId),
      eq(oauthStateNonces.workspaceId, input.workspaceId),
      eq(oauthStateNonces.provider, input.provider),
      isNull(oauthStateNonces.consumedAt),
    ),
  ));
  await db.insert(oauthStateNonces).values({
    userId: input.userId,
    workspaceId: input.workspaceId,
    provider: input.provider,
    nonce,
    expiresAt: new Date(Date.now() + STATE_MAX_AGE_MS),
  });
  return buildSignedState({ n: nonce, p: input.provider, t: Date.now() });
}

export type OauthStateCheck =
  | { ok: true; workspaceId: string }
  | { ok: false; error: string };

/**
 * Build a signed install state for an integration OAuth flow, creating a
 * server-side nonce bound to the acting user + workspace. Used by every
 * install endpoint so the callback can redeem the nonce.
 */
export async function createInstallState(input: {
  userId: string;
  workspaceId: string;
  provider: string;
}): Promise<string> {
  return createOauthStateNonce(input);
}

/**
 * Redeem a nonce from a callback: verify the HMAC, then confirm the nonce
 * exists, is unexpired, is unconsumed, and belongs to the same user + workspace
 * that started the flow. On success the nonce is atomically consumed so it
 * cannot be replayed. This decouples the callback from the browser session
 * (works across tabs/devices) while still binding it to the original actor.
 */
export async function verifyAndConsumeOauthStateNonce(input: {
  state: string;
  userId: string;
  workspaceId: string;
  provider?: string;
}): Promise<OauthStateCheck> {
  const payload = verifySignedState(input.state);
  if (!payload || typeof payload.n !== "string" || typeof payload.p !== "string") {
    return { ok: false, error: "Invalid state." };
  }
  const nonce = payload.n;

  const [row] = await db
    .select()
    .from(oauthStateNonces)
    .where(eq(oauthStateNonces.nonce, nonce))
    .limit(1);

  if (!row) {
    return { ok: false, error: "Unknown or already-used state." };
  }
  if (row.provider !== payload.p || (input.provider && input.provider !== row.provider)) {
    return { ok: false, error: "State provider mismatch." };
  }
  if (row.userId !== input.userId || row.workspaceId !== input.workspaceId) {
    log.warn(
      { nonce, provider: row.provider },
      "oauth state actor mismatch (possible escalation/replay)",
    );
    return { ok: false, error: "State actor mismatch." };
  }
  if (row.consumedAt) {
    return { ok: false, error: "State already used." };
  }
  if (row.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "State expired." };
  }

  const consumed = await db
    .update(oauthStateNonces)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(oauthStateNonces.nonce, nonce),
        // only consume if still unused, so a concurrent replay fails
        isNull(oauthStateNonces.consumedAt),
      ),
    )
    .returning({ id: oauthStateNonces.id });

  if (consumed.length !== 1) {
    return { ok: false, error: "State already used." };
  }

  return { ok: true, workspaceId: row.workspaceId };
}
