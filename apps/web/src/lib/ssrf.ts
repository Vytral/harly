import "server-only";

import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";

const MAX_REDIRECTS = 5;

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

type ResolvedAddress = { address: string; family: 4 | 6 };

/** Resolve once, validate every answer, then use the chosen address for TCP. */
export async function resolveSafeAddress(
  hostname: string,
  allowPrivate = false,
): Promise<ResolvedAddress> {
  const bare = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  if (isBlockedHost(bare) && !allowPrivate) {
    throw new Error("URL points to a blocked host.");
  }
  const family = isIP(bare);
  if (family === 4 || family === 6) return { address: bare, family };

  const addresses = await lookup(bare, { all: true, verbatim: true });
  if (addresses.length === 0 || (!allowPrivate && addresses.some(({ address }) => isBlockedHost(address)))) {
    throw new Error("Hostname resolves to a blocked network.");
  }
  const address = addresses[0]!;
  return { address: address.address, family: address.family as 4 | 6 };
}

/**
 * Make one request using a lookup callback pinned to the already validated
 * address. Native fetch performs its own DNS lookup after validation, which
 * leaves a DNS-rebinding window; http(s).request lets us bind that lookup.
 */
async function fetchPinned(
  url: URL,
  init: RequestInit,
  allowPrivate = false,
): Promise<Response> {
  const resolved = await resolveSafeAddress(url.hostname, allowPrivate);
  const headers = Object.fromEntries(new Headers(init.headers).entries());
  const body = init.body;
  if (body != null && typeof body !== "string" && !(body instanceof Uint8Array)) {
    throw new Error("Unsupported outbound request body.");
  }

  return new Promise<Response>((resolve, reject) => {
    const request = url.protocol === "https:" ? httpsRequest : httpRequest;
    const outgoing = request(url, {
      method: init.method ?? "GET",
      headers,
      signal: init.signal ?? undefined,
      lookup: (_hostname, _options, callback) => callback(null, resolved.address, resolved.family),
    }, (incoming) => {
      resolve(new Response(Readable.toWeb(incoming) as ReadableStream, {
        status: incoming.statusCode ?? 502,
        statusText: incoming.statusMessage ?? "",
        headers: incoming.headers as HeadersInit,
      }));
    });
    outgoing.once("error", reject);
    outgoing.end(body);
  });
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

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await fetchPinned(parsed, {
      // Bound the risk: no credentials, short timeout.
      signal: AbortSignal.timeout(10_000),
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location || redirects === MAX_REDIRECTS) throw new Error("Logo redirect limit exceeded.");
    parsed = new URL(location, parsed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Only http(s) logo URLs are allowed.");
    }
  }
  throw new Error("Logo redirect limit exceeded.");
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
  await resolveSafeAddress(parsed.hostname, allowPrivate);
  return parsed;
}

/** Validate the destination before the initial request and every redirect. */
export async function safeFetchWebhook(
  url: string,
  init: RequestInit,
): Promise<Response> {
  let current = await validateWebhookUrl(url);
  const allowPrivate = process.env.HARLY_ALLOW_PRIVATE_WEBHOOKS === "true";
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await fetchPinned(current, init, allowPrivate);
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location || redirects === MAX_REDIRECTS) {
      throw new Error("Webhook redirect limit exceeded.");
    }
    current = await validateWebhookUrl(new URL(location, current).toString());
  }
  throw new Error("Webhook redirect limit exceeded.");
}
