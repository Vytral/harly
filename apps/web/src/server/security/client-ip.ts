/**
 * Single source of truth for "who is the client behind this request?".
 *
 * Import `resolveClientIp` (raw `Headers`, `undefined` when nothing usable) or
 * `getClientIp` (`Request`, `"unknown"` fallback) from here for rate limits,
 * IP allowlists, audit logs and portal limits. Do not read `x-forwarded-for`
 * anywhere else.
 *
 * Trust model: every forwarding header is client-settable unless a proxy we
 * control overwrote it, and a Next.js route cannot see the TCP peer. So no
 * header is ever used to decide whether a hop is "a trusted proxy" (the old
 * `x-forwarded-peer` marker could be sent by any client). Instead we walk
 * `x-forwarded-for` from the right: each reverse proxy appends the address it
 * received the request from, so the rightmost entries were written by our own
 * infrastructure while everything to the left is attacker-controllable. Hops
 * listed in TRUSTED_PROXY_IPS (extra proxies / CDN edges that appear in the
 * chain) are skipped; the first hop that is not trusted is the client.
 *
 * With no proxy in front of Harly the header is fully client-controlled; that
 * deployment cannot be protected from headers alone, see the proxy docs.
 */

function normalizeIp(value: string): string {
  return value.trim().toLowerCase().replace(/^::ffff:/, "");
}

function trustedProxyIps(): Set<string> {
  return new Set(
    (process.env.TRUSTED_PROXY_IPS ?? "")
      .split(",")
      .map(normalizeIp)
      .filter(Boolean),
  );
}

export function resolveClientIp(headers: Pick<Headers, "get">): string | undefined {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((hop) => hop.trim())
      .filter(Boolean);
    if (hops.length > 0) {
      const trusted = trustedProxyIps();
      for (let i = hops.length - 1; i >= 0; i -= 1) {
        if (!trusted.has(normalizeIp(hops[i]))) return hops[i];
      }
      // Every hop is one of our own proxies: the leftmost is the best we have.
      return hops[0];
    }
  }
  return headers.get("x-real-ip")?.trim() || undefined;
}

export function getClientIp(request: Pick<Request, "headers">): string {
  return resolveClientIp(request.headers) ?? "unknown";
}
