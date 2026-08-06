import "server-only";

import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";

const MAX_REDIRECTS = 5;

function parseIpv6Groups(value: string): number[] | null {
  const halves = value.split("::");
  if (halves.length > 2) return null;

  const parseHalf = (half: string): number[] => {
    if (!half) return [];
    const groups = half.split(":");
    if (groups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) return [];
    return groups.map((group) => Number.parseInt(group, 16));
  };

  const left = parseHalf(halves[0] ?? "");
  const right = parseHalf(halves[1] ?? "");
  if (left.length + right.length > 8) return null;

  if (halves.length === 1) return left.length === 8 ? left : null;

  const compressed = 8 - left.length - right.length;
  if (compressed < 1) return null;
  return [...left, ...Array.from({ length: compressed }, () => 0), ...right];
}

/** Return the IPv4 tail when hostname is an IPv4-mapped IPv6 address. */
function mappedIpv4Address(hostname: string): string | null {
  const match = /:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(hostname);
  let groups: number[] | null;
  if (match && match.index !== undefined && isIP(match[1]) === 4) {
    const octets = match[1].split(".").map(Number);
    const mapped = `${hostname.slice(0, match.index)}:${((octets[0]! << 8) | octets[1]!).toString(16)}:${((octets[2]! << 8) | octets[3]!).toString(16)}`;
    groups = parseIpv6Groups(mapped);
  } else if (isIP(hostname) === 6) {
    groups = parseIpv6Groups(hostname);
  } else {
    return null;
  }

  if (!groups || groups.length !== 8) return null;
  if (groups.slice(0, 5).some((group) => group !== 0) || groups[5] !== 0xffff)
    return null;
  return (
    match?.[1] ??
    [
      groups[6]! >> 8,
      groups[6]! & 0xff,
      groups[7]! >> 8,
      groups[7]! & 0xff,
    ].join(".")
  );
}

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

  const mappedIpv4 = mappedIpv4Address(bare);
  if (mappedIpv4) return isBlockedHost(mappedIpv4);

  const ipKind = isIP(bare);
  if (ipKind === 4) {
    const [a, b] = bare.split(".").map(Number);
    // Unspecified, private, loopback, link-local, and carrier-grade ranges.
    if (a === 0) return true;
    if (a === 10) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 192 && b === 0) return true;
    if (a === 198 && b >= 18 && b <= 19) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }
  if (ipKind === 6) {
    const groups = parseIpv6Groups(bare);
    if (!groups) return true;
    const first = groups[0]!;
    const firstSixZero = groups.slice(0, 6).every((group) => group === 0);
    if (firstSixZero) return true; // ::/96, including :: and IPv4-compatible forms
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((first & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local
    if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
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

/** Make one validated request without following redirects or forwarding secrets to a new host. */
export async function safeFetchHttp(
  url: string,
  init: RequestInit = {},
  allowPrivate = false,
): Promise<Response> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid outbound URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Outbound URLs cannot contain credentials.");
  }
  return fetchPinned(parsed, init, allowPrivate);
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
    const next = new URL(location, current);
    if (next.origin !== current.origin) {
      throw new Error("Webhook redirects must stay on the configured origin.");
    }
    current = await validateWebhookUrl(next.toString());
  }
  throw new Error("Webhook redirect limit exceeded.");
}
