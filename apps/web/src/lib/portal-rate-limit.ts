import "server-only";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";

import { clientIp, enforcePersistentRateLimit } from "@/server/api/ratelimit";

export type PortalRateTier = { limit: number; windowMs: number };

/**
 * Pseudonymous origin identifier. Client IPs are never stored in clear text in
 * rate-limit buckets: the key holds a keyed hash that cannot be reversed
 * without the server secret.
 */
export function pseudonymize(value: string): string {
  const secret =
    process.env.BETTER_AUTH_SECRET ?? process.env.AI_ENCRYPTION_KEY ?? "harly";
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
 */
export async function passesPortalRateLimit(
  key: string,
  tiers: PortalRateTier[],
): Promise<boolean> {
  let ok = true;
  for (const [index, tier] of tiers.entries()) {
    try {
      await enforcePersistentRateLimit(`portal:${key}:t${index}`, tier);
    } catch {
      ok = false;
    }
  }
  return ok;
}
