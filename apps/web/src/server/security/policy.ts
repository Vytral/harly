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

export function isEmailDomainAllowed(email: string, domains: string[]): boolean {
  if (domains.length === 0) return true;
  const domain = email.trim().toLowerCase().split("@").pop() ?? "";
  return domains.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}

export function detectSuspiciousSession(input: {
  previousIp?: string | null;
  currentIp?: string | null;
  previousUserAgent?: string | null;
  currentUserAgent?: string | null;
}): boolean {
  const ipChanged = Boolean(input.previousIp && input.currentIp && input.previousIp !== input.currentIp);
  const previousFamily = input.previousUserAgent?.split(" ")[0]?.split("/")[0];
  const currentFamily = input.currentUserAgent?.split(" ")[0]?.split("/")[0];
  return ipChanged && Boolean(previousFamily && currentFamily && previousFamily !== currentFamily);
}
