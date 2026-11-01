/**
 * Redirect URI rules (OAuth 2.1 section 2.3.1 + RFC 8252).
 *  - Authorization requests must use a URI registered exactly.
 *  - Loopback http redirects (localhost, 127.0.0.1, [::1]) ignore the port, since
 *    native apps bind an ephemeral one.
 *  - Registration accepts https, loopback http and private-use native schemes
 *    (cursor://, vscode://...). Everything that executes or leaks (javascript:,
 *    data:, file:, plain http to a remote host) is refused.
 */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const FORBIDDEN_SCHEMES = new Set([
  "javascript:",
  "data:",
  "file:",
  "vbscript:",
  "blob:",
  "about:",
  "ftp:",
  "ws:",
  "wss:",
  "chrome:",
]);

export const MAX_REDIRECT_URIS = 10;
export const MAX_REDIRECT_URI_LENGTH = 2048;

export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

function parse(uri: string): URL | null {
  if (uri.length > MAX_REDIRECT_URI_LENGTH) return null;
  try {
    return new URL(uri);
  } catch {
    return null;
  }
}

/** Returns an error message when `uri` cannot be registered, otherwise null. */
export function validateRedirectUriForRegistration(uri: string): string | null {
  const url = parse(uri);
  if (!url) return "redirect_uri is not a valid absolute URI";
  if (url.hash) return "redirect_uri must not contain a fragment";
  if (url.username || url.password) return "redirect_uri must not contain credentials";
  if (FORBIDDEN_SCHEMES.has(url.protocol)) return `redirect_uri scheme ${url.protocol} is not allowed`;
  if (url.protocol === "https:") {
    if (isLoopbackHost(url.hostname)) return "loopback redirect_uri must use http";
    return null;
  }
  if (url.protocol === "http:") {
    return isLoopbackHost(url.hostname)
      ? null
      : "http redirect_uri is only allowed for loopback addresses";
  }
  // Private-use scheme for native apps: needs at least a host or a path.
  if (!/^[a-z][a-z0-9+.-]*:$/.test(url.protocol)) return "redirect_uri scheme is invalid";
  return null;
}

/** Does the requested redirect_uri match one of the client's registered URIs? */
export function matchRedirectUri(requested: string, registered: readonly string[]): boolean {
  const req = parse(requested);
  if (!req || req.hash) return false;
  for (const candidate of registered) {
    if (candidate === requested) return true;
    const reg = parse(candidate);
    if (!reg) continue;
    if (
      reg.protocol === "http:" &&
      req.protocol === "http:" &&
      isLoopbackHost(reg.hostname) &&
      reg.hostname.toLowerCase() === req.hostname.toLowerCase() &&
      reg.pathname === req.pathname &&
      reg.search === req.search &&
      !req.username &&
      !req.password
    ) {
      return true;
    }
  }
  return false;
}

/** Host shown on the consent screen so people see where the code is sent. */
export function redirectDisplayHost(uri: string): string {
  const url = parse(uri);
  if (!url) return "unknown";
  if (url.protocol === "http:" || url.protocol === "https:") {
    return isLoopbackHost(url.hostname) ? "localhost (this device)" : url.host;
  }
  return `${url.protocol}//${url.host}`.replace(/\/\/$/, "//");
}

/** Append OAuth response parameters to a redirect URI (query component). */
export function buildRedirect(base: string, params: Record<string, string | undefined>): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url.toString();
}
