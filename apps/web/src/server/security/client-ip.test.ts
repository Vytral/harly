import { afterEach, describe, expect, it } from "vitest";

import { getClientIp, resolveClientIp } from "./client-ip";

const original = process.env.TRUSTED_PROXY_IPS;

afterEach(() => {
  if (original === undefined) delete process.env.TRUSTED_PROXY_IPS;
  else process.env.TRUSTED_PROXY_IPS = original;
});

function headers(init: Record<string, string>) {
  return new Headers(init);
}

describe("resolveClientIp", () => {
  it("uses the rightmost hop, which our own proxy appended", () => {
    delete process.env.TRUSTED_PROXY_IPS;
    expect(
      resolveClientIp(headers({ "x-forwarded-for": "10.9.9.9, 203.0.113.9" })),
    ).toBe("203.0.113.9");
  });

  it("cannot be spoofed with x-forwarded-peer, even when it matches TRUSTED_PROXY_IPS", () => {
    process.env.TRUSTED_PROXY_IPS = "127.0.0.1";
    const ip = resolveClientIp(
      headers({
        "x-forwarded-for": "10.0.0.1, 203.0.113.50",
        "x-forwarded-peer": "127.0.0.1",
        "x-real-ip": "127.0.0.1",
      }),
    );
    expect(ip).toBe("203.0.113.50");
  });

  it("does not let a spoofed allowlisted address through a trusted-proxy setup", () => {
    process.env.TRUSTED_PROXY_IPS = "127.0.0.1";
    const ip = resolveClientIp(
      headers({
        "x-forwarded-for": "10.0.0.5, 198.51.100.77",
        "x-forwarded-peer": "127.0.0.1",
      }),
    );
    expect(ip).not.toBe("10.0.0.5");
  });

  it("skips trusted proxy hops from the right to find the client", () => {
    process.env.TRUSTED_PROXY_IPS = "192.0.2.1, 192.0.2.2";
    expect(
      resolveClientIp(
        headers({ "x-forwarded-for": "6.6.6.6, 198.51.100.7, 192.0.2.1, 192.0.2.2" }),
      ),
    ).toBe("198.51.100.7");
  });

  it("matches trusted hops regardless of IPv4-mapped notation", () => {
    process.env.TRUSTED_PROXY_IPS = "192.0.2.1";
    expect(
      resolveClientIp(headers({ "x-forwarded-for": "198.51.100.7, ::ffff:192.0.2.1" })),
    ).toBe("198.51.100.7");
  });

  it("falls back to x-real-ip, then undefined or 'unknown'", () => {
    delete process.env.TRUSTED_PROXY_IPS;
    expect(resolveClientIp(headers({ "x-real-ip": "198.51.100.1" }))).toBe("198.51.100.1");
    expect(resolveClientIp(headers({}))).toBeUndefined();
    expect(getClientIp(new Request("https://harly.test"))).toBe("unknown");
  });
});
