import { afterEach, describe, expect, it } from "vitest";

import { detectSuspiciousSession, getTrustedClientIp, isEmailDomainAllowed, isIpAllowed, normalizeSecurityPolicy } from "./policy";

const originalTrustedProxyIps = process.env.TRUSTED_PROXY_IPS;

afterEach(() => {
  if (originalTrustedProxyIps === undefined) delete process.env.TRUSTED_PROXY_IPS;
  else process.env.TRUSTED_PROXY_IPS = originalTrustedProxyIps;
});

describe("enterprise security policy", () => {
  it("matches exact IPv4 addresses and CIDRs while keeping empty policy open", () => {
    expect(isIpAllowed("10.10.2.8", ["10.0.0.0/8"])).toBe(true);
    expect(isIpAllowed("192.168.1.8", ["10.0.0.0/8"])).toBe(false);
    expect(isIpAllowed("192.168.1.8", [])).toBe(true);
  });

  it("allows subdomains only beneath configured domains", () => {
    expect(isEmailDomainAllowed("recruiter@acme.com", ["acme.com"])).toBe(true);
    expect(isEmailDomainAllowed("recruiter@team.acme.com", ["acme.com"])).toBe(true);
    expect(isEmailDomainAllowed("recruiter@notacme.com", ["acme.com"])).toBe(false);
  });

  it("flags an IP plus browser-family change as suspicious", () => {
    expect(detectSuspiciousSession({ previousIp: "10.0.0.1", currentIp: "203.0.113.1", previousUserAgent: "Chrome/1", currentUserAgent: "Firefox/1" })).toBe(true);
    expect(detectSuspiciousSession({ previousIp: "10.0.0.1", currentIp: "203.0.113.1", previousUserAgent: "Chrome/1", currentUserAgent: "Chrome/2" })).toBe(false);
  });

  it("normalizes policy bounds and domain prefixes", () => {
    expect(normalizeSecurityPolicy({ ipAllowlist: [" 10.0.0.0/8 "], allowedDomains: ["@Acme.com"], reauthMinutes: 999 })).toMatchObject({ ipAllowlist: ["10.0.0.0/8"], allowedDomains: ["acme.com"], reauthMinutes: 60 });
  });

  it("uses the rightmost forwarded hop unless the peer is trusted", () => {
    const request = new Request("https://harly.test", {
      headers: {
        "x-forwarded-for": "198.51.100.7, 203.0.113.9",
        "x-real-ip": "203.0.113.9",
      },
    });
    delete process.env.TRUSTED_PROXY_IPS;
    expect(getTrustedClientIp(request)).toBe("203.0.113.9");

    process.env.TRUSTED_PROXY_IPS = "203.0.113.9";
    const trustedRequest = new Request("https://harly.test", {
      headers: {
        "x-forwarded-for": "198.51.100.7, 203.0.113.9",
        "x-forwarded-peer": "203.0.113.9",
      },
    });
    expect(getTrustedClientIp(trustedRequest)).toBe("198.51.100.7");
  });
});
