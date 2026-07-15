import "server-only";

import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

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

export async function validateWebhookUrl(url: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid webhook URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Webhook URLs must use HTTPS.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Webhook URLs cannot contain credentials.");
  }

  const allowPrivate = process.env.HARLY_ALLOW_PRIVATE_WEBHOOKS === "true";
  if (!allowPrivate && isBlockedHost(parsed.hostname)) {
    throw new Error("Webhook URL points to a blocked host.");
  }
  if (!allowPrivate && !isIP(parsed.hostname)) {
    const addresses = await lookup(parsed.hostname, { all: true, verbatim: true });
    if (addresses.length === 0 || addresses.some(({ address }) => isBlockedHost(address))) {
      throw new Error("Webhook hostname resolves to a blocked network.");
    }
  }
  return parsed;
}

/** Validate the destination before the initial request and every redirect. */
export async function safeFetchWebhook(
  url: string,
  init: RequestInit,
): Promise<Response> {
  let current = await validateWebhookUrl(url);
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const response = await fetch(current, { ...init, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location || redirects === 5) {
      throw new Error("Webhook redirect limit exceeded.");
    }
    current = await validateWebhookUrl(new URL(location, current).toString());
  }
  throw new Error("Webhook redirect limit exceeded.");
}
