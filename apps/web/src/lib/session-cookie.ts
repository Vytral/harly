import { createHmac } from "node:crypto";

/**
 * Sign a cookie value the way better-auth (via better-call) does:
 * `<value>.<base64(HMAC-SHA256(value, secret))>`.
 *
 * better-auth stores the session token as a SIGNED cookie. A route that issues
 * a session itself — rather than going through better-auth's own sign-in
 * handlers — must sign the token the same way, or `getSession` rejects the
 * cookie and the visitor stays anonymous despite a successful authentication.
 *
 * better-call URL-encodes the result itself, but Next.js's `cookies.set()` also
 * encodes the value, so this returns the RAW signed string and lets Next apply
 * the single encode. Encoding here as well would double-encode `/`, `+`, and
 * `=`, which breaks verification.
 */
export function signSessionCookieValue(value: string, secret: string): string {
  const signature = createHmac("sha256", secret).update(value).digest("base64");
  return `${value}.${signature}`;
}
