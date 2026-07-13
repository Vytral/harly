import "server-only";

import { isIP } from "node:net";

/**
 * Reject URLs that point at the loopback interface, link-local / private
 * ranges, or non-http(s) schemes. Used wherever we fetch a user-supplied
 * image URL so the server can't be coerced into hitting internal services.
 */
export function isBlockedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  if (lower === "localhost" || lower.endsWith(".localhost")) return true;

  // Strip IPv6 brackets.
  const bare = lower.startsWith("[") && lower.endsWith("]")
    ? lower.slice(1, -1)
    : lower;

  const ipKind = isIP(bare);
  if (ipKind === 4) {
    const [a, b] = bare.split(".").map(Number);
    // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }
  if (ipKind === 6) {
    if (bare === "::1") return true;
    if (bare.startsWith("fc") || bare.startsWith("fd") || bare.startsWith("fe80"))
      return true;
    return false;
  }

  // Bare hostnames (no dot) are treated as internal.
  if (!bare.includes(".")) return true;

  // Cloud metadata endpoints.
  if (bare.endsWith("169.254.169.254")) return true;

  return false;
}

export async function safeFetchImage(url: string): Promise<Response> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid logo URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http(s) logo URLs are allowed.");
  }

  if (isBlockedHost(parsed.hostname)) {
    throw new Error("Logo URL points to a blocked host.");
  }

  const response = await fetch(parsed.toString(), {
    redirect: "follow",
    // Bound the risk: no credentials, short timeout.
    signal: AbortSignal.timeout(10_000),
  });

  return response;
}
