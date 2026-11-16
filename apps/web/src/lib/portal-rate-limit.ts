import "server-only";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";

import { createLogger } from "@/lib/logger";
import {
  clientIp,
  enforcePersistentRateLimit,
  rateLimitResultFromError,
} from "@/server/api/ratelimit";

const log = createLogger("portal-rate-limit");

export type PortalRateTier = { limit: number; windowMs: number };

/**
 * A fixed fallback key would make pseudonymized origins reversible by anyone who
 * reads this source, so only development may use one.
 */
function devSecret(): string {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "BETTER_AUTH_SECRET (or AI_ENCRYPTION_KEY) is required to pseudonymize rate-limit keys.",
    );
  }
  return "harly-dev-only";
}

/**
 * Pseudonymous origin identifier. Client IPs are never stored in clear text in
 * rate-limit buckets: the key holds a keyed hash that cannot be reversed
 * without the server secret.
 */
export function pseudonymize(value: string): string {
  const secret =
    process.env.BETTER_AUTH_SECRET ?? process.env.AI_ENCRYPTION_KEY ?? devSecret();
  return createHmac("sha256", secret).update(value).digest("hex").slice(0, 24);
}

export async function currentOriginHash(): Promise<string> {
  const h = await headers();
  const ip = clientIp(
    new Request("http://harly.local", {
      headers: {
        "x-forwarded-for": h.get("x-forwarded-for") ?? "",
        "x-real-ip": h.get("x-real-ip") ?? "",
      },
    }),
  );
  return pseudonymize(`ip:${ip}`);
}

/**
 * Consumes one slot from every tier. Returns false when any tier is exhausted
 * (progressive blocking: short window first, then a longer, stricter one).
 * Any other failure (for example the database being unreachable) is not a rate
 * limit: it is logged and rethrown so callers fail closed without telling the
 * candidate they sent too many requests.
 */
export async function passesPortalRateLimit(
  key: string,
  tiers: PortalRateTier[],
): Promise<boolean> {
  let ok = true;
  for (const [index, tier] of tiers.entries()) {
    try {
      await enforcePersistentRateLimit(`portal:${key}:t${index}`, tier);
    } catch (error) {
      if (rateLimitResultFromError(error) === null) {
        log.error(error, "Portal rate limit check failed");
        throw error;
      }
      ok = false;
    }
  }
  return ok;
}
