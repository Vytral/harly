import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import type { ApiKeyType } from "./scopes";

/**
 * API key format: `harly_{pk|sk}_{live|test}_{43-char base64url}`.
 *
 * The raw key is shown to the user exactly once. We persist only:
 *  - `hashedKey` — SHA-256 hex of the full raw string, used for lookup + verify.
 *  - `prefix`    — masked display value (`harly_sk_live_AbCd…`).
 *  - `last4`     — last 4 chars for disambiguation in the UI.
 */
export type GeneratedApiKey = {
  raw: string;
  type: ApiKeyType;
  environment: "live" | "test";
  prefix: string;
  last4: string;
  hashedKey: string;
};

const TYPE_TOKEN: Record<ApiKeyType, string> = {
  publishable: "pk",
  secret: "sk",
};

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function generateApiKey(input: {
  type: ApiKeyType;
  environment?: "live" | "test";
}): GeneratedApiKey {
  const environment = input.environment ?? "live";
  const secret = randomBytes(32).toString("base64url");
  const raw = `harly_${TYPE_TOKEN[input.type]}_${environment}_${secret}`;

  return {
    raw,
    type: input.type,
    environment,
    // e.g. "harly_sk_live_AbCdEf" — enough to recognise without leaking the key.
    prefix: raw.slice(0, 20),
    last4: raw.slice(-4),
    hashedKey: hashApiKey(raw),
  };
}

/** Parse + validate the static shape of a presented key. Null = malformed. */
export function parseApiKey(
  raw: string,
): { type: ApiKeyType; environment: "live" | "test" } | null {
  const match = /^harly_(pk|sk)_(live|test)_[A-Za-z0-9_-]{20,}$/.exec(raw);
  if (!match) return null;
  return {
    type: match[1] === "pk" ? "publishable" : "secret",
    environment: match[2] as "live" | "test",
  };
}

/** Constant-time compare of a presented key against a stored hash. */
export function verifyApiKey(raw: string, storedHash: string): boolean {
  const a = Buffer.from(hashApiKey(raw), "utf8");
  const b = Buffer.from(storedHash, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
