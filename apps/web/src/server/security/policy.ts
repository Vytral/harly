import { resolveClientIp } from "./client-ip";

export type SecurityPolicy = {
  ipAllowlist: string[];
  allowedDomains: string[];
  riskDetectionEnabled: boolean;
  reauthMinutes: number;
  requirePasskey: boolean;
};

function normalized(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim().toLowerCase()).filter(Boolean)
    : [];
}

export function normalizeSecurityPolicy(input: Partial<SecurityPolicy>): SecurityPolicy {
  return {
    ipAllowlist: normalized(input.ipAllowlist),
    allowedDomains: normalized(input.allowedDomains).map((domain) => domain.replace(/^@/, "")),
    riskDetectionEnabled: input.riskDetectionEnabled ?? true,
    reauthMinutes: Math.min(Math.max(Math.floor(input.reauthMinutes ?? 15), 5), 60),
    requirePasskey: input.requirePasskey ?? false,
  };
}

/** Supports exact IPv4 addresses and CIDR blocks. Empty allowlist is open. */
export function isIpAllowed(ip: string | null | undefined, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  if (!ip) return false;
  const value = ip.trim().replace(/^::ffff:/, "");
  const toInt = (part: string) => part.split(".").reduce((out, octet) => (out * 256) + Number(octet), 0) >>> 0;
  const target = toInt(value);
  if (value.split(".").length !== 4 || !Number.isFinite(target)) return false;
  return allowlist.some((entry) => {
    const [network, bitsRaw] = entry.split("/");
    if (network.split(".").length !== 4) return false;
    const bits = bitsRaw == null ? 32 : Number(bitsRaw);
    if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (target & mask) === (toInt(network) & mask);
  });
}

/**
 * Resolve the client address; see `./client-ip` for the trust model.
 * Kept here for existing importers.
 */
export function getTrustedClientIp(
  request: Pick<Request, "headers">,
): string | undefined {
  return resolveClientIp(request.headers);
}

export function isEmailDomainAllowed(email: string, domains: string[]): boolean {
  if (domains.length === 0) return true;
  const domain = email.trim().toLowerCase().split("@").pop() ?? "";
  return domains.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}

/**
 * Coarse "browser/OS" family of a User-Agent, e.g. `chrome/windows`. Every
 * mainstream browser starts its UA with `Mozilla/5.0`, so the first token says
 * nothing; the order of the checks matters because Chromium derivatives also
 * announce Chrome and Safari. Version numbers are ignored on purpose so an
 * auto-update does not look like a different client. Returns null when the
 * string is empty.
 */
export function userAgentFamily(userAgent: string | null | undefined): string | null {
  const ua = userAgent?.trim();
  if (!ua) return null;

  let browser: string;
  if (/\b(?:Edg|EdgA|EdgiOS|Edge)\//.test(ua)) browser = "edge";
  else if (/\b(?:OPR|OPiOS|Opera)\//.test(ua)) browser = "opera";
  else if (/\b(?:Firefox|FxiOS)\//.test(ua)) browser = "firefox";
  else if (/\b(?:Chrome|CriOS|Chromium)\//.test(ua)) browser = "chrome";
  else if (/\bSafari\//.test(ua) && /\bVersion\//.test(ua)) browser = "safari";
  else browser = ua.split(/[\s/]/)[0]?.toLowerCase() || "unknown";

  let os = "other";
  if (/\b(?:iPhone|iPad|iPod)\b/.test(ua)) os = "ios";
  else if (/\bAndroid\b/.test(ua)) os = "android";
  else if (/\bWindows\b/.test(ua)) os = "windows";
  else if (/\bCrOS\b/.test(ua)) os = "chromeos";
  else if (/\bMac OS X\b|\bMacintosh\b/.test(ua)) os = "macos";
  else if (/\bLinux\b|\bX11\b/.test(ua)) os = "linux";

  return `${browser}/${os}`;
}

/** True when the IP changed and the browser or OS family changed with it. */
export function detectSuspiciousSession(input: {
  previousIp?: string | null;
  currentIp?: string | null;
  previousUserAgent?: string | null;
  currentUserAgent?: string | null;
}): boolean {
  const ipChanged = Boolean(input.previousIp && input.currentIp && input.previousIp !== input.currentIp);
  const previousFamily = userAgentFamily(input.previousUserAgent);
  const currentFamily = userAgentFamily(input.currentUserAgent);
  return ipChanged && Boolean(previousFamily && currentFamily && previousFamily !== currentFamily);
}
