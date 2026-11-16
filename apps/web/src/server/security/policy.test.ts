import { afterEach, describe, expect, it } from "vitest";

import { detectSuspiciousSession, getTrustedClientIp, userAgentFamily, isEmailDomainAllowed, isIpAllowed, normalizeSecurityPolicy } from "./policy";

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

  it("ignores a client-supplied x-forwarded-peer marker", () => {
    process.env.TRUSTED_PROXY_IPS = "203.0.113.9";
    const spoofed = new Request("https://harly.test", {
      headers: {
        "x-forwarded-for": "198.51.100.7, 192.0.2.50",
        "x-forwarded-peer": "203.0.113.9",
        "x-real-ip": "203.0.113.9",
      },
    });
    expect(getTrustedClientIp(spoofed)).toBe("192.0.2.50");
  });

  describe("user-agent families", () => {
    const chromeWin = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
    const chromeWinNewer = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    const edgeWin = `${chromeWin} Edg/126.0.0.0`;
    const firefoxMac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:128.0) Gecko/20100101 Firefox/128.0";
    const safariIos = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
    const chromeAndroid = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

    it("derives a real browser and OS family", () => {
      expect(userAgentFamily(chromeWin)).toBe("chrome/windows");
      expect(userAgentFamily(edgeWin)).toBe("edge/windows");
      expect(userAgentFamily(firefoxMac)).toBe("firefox/macos");
      expect(userAgentFamily(safariIos)).toBe("safari/ios");
      expect(userAgentFamily(chromeAndroid)).toBe("chrome/android");
      expect(userAgentFamily("")).toBeNull();
      expect(userAgentFamily(null)).toBeNull();
    });

    it("flags a different browser or OS together with an IP change", () => {
      const base = { previousIp: "10.0.0.1", currentIp: "203.0.113.1", previousUserAgent: chromeWin };
      expect(detectSuspiciousSession({ ...base, currentUserAgent: firefoxMac })).toBe(true);
      expect(detectSuspiciousSession({ ...base, currentUserAgent: edgeWin })).toBe(true);
      expect(detectSuspiciousSession({ ...base, currentUserAgent: chromeAndroid })).toBe(true);
    });

    it("ignores browser upgrades and IP-only or UA-only changes", () => {
      const base = { previousIp: "10.0.0.1", currentIp: "203.0.113.1", previousUserAgent: chromeWin };
      expect(detectSuspiciousSession({ ...base, currentUserAgent: chromeWinNewer })).toBe(false);
      expect(detectSuspiciousSession({ ...base, currentIp: "10.0.0.1", currentUserAgent: firefoxMac })).toBe(false);
    });
  });
});
