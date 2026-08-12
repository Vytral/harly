import "server-only";

const DEFAULT_PUBLIC_ORIGIN = "http://localhost:3000";
const BUILD_PUBLIC_ORIGIN = "https://build.invalid";

function isUnsafeProductionHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  const ipv4Parts = normalized.split(".");
  const isIpv4Loopback =
    ipv4Parts.length === 4 &&
    ipv4Parts[0] === "127" &&
    ipv4Parts.slice(1).every((part) => /^(?:0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255);
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    isIpv4Loopback ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized === "0.0.0.0" ||
    normalized === "::" ||
    normalized === "[::]"
  );
}

/**
 * Return the canonical origin that external providers must redirect to.
 *
 * HARLY_URL is the source of truth for production. The legacy public alias is
 * retained only for older deployments while they migrate their environment.
 */
export function getHarlyPublicOrigin(): string {
  const configured =
    process.env.HARLY_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.BETTER_AUTH_URL ??
    DEFAULT_PUBLIC_ORIGIN;

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("HARLY_URL must be an absolute HTTP(S) URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("HARLY_URL must use HTTP or HTTPS.");
  }
  if (
    process.env.NODE_ENV === "production" &&
    isUnsafeProductionHost(url.hostname)
  ) {
    if (process.env.NEXT_PHASE === "phase-production-build") {
      return BUILD_PUBLIC_ORIGIN;
    }
    throw new Error("HARLY_URL must use a reachable public hostname, not a local or bind address.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("HARLY_URL must be a public origin without credentials or query parameters.");
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("HARLY_URL must use HTTPS in production.");
  }

  return url.origin;
}

/** Resolve an app-relative URL against the configured public origin.
 * Never use request.url here: behind a reverse proxy it can contain the
 * container's listen address (for example 0.0.0.0:3000).
 */
export function toHarlyPublicUrl(pathname: string): string {
  return new URL(pathname, `${getHarlyPublicOrigin()}/`).toString();
}

/** Inbound DocuSeal webhook base. Only `?ws=` is appended per workspace; the
 * shared secret travels in X-DocuSeal-Secret (or an HMAC-capable proxy). */
export function getEsignWebhookBaseUrl(): string {
  return `${getHarlyPublicOrigin()}/api/integrations/docuseal/webhook`;
}
