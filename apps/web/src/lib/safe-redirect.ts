/**
 * Post-login redirect targets come from `?redirect=` on a public page, so they
 * are attacker-controlled. Accept only a same-origin absolute path; anything
 * else (`https://evil.test`, `//evil.test`, `/\evil.test`, `javascript:`) falls
 * back to a safe default.
 */
export function safeRedirectPath(
  value: unknown,
  fallback = "/dashboard",
): string {
  if (typeof value !== "string") return fallback;
  const candidate = value.trim();
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return fallback;
  // Browsers treat backslashes as slashes and strip tabs/newlines in URLs.
  if (/[\\\u0000-\u001f\u007f]/.test(candidate)) return fallback;
  try {
    const base = "http://harly.invalid";
    const parsed = new URL(candidate, base);
    if (parsed.origin !== base) return fallback;
  } catch {
    return fallback;
  }
  return candidate;
}
