import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { safeFetchImage } from "@/lib/ssrf";

describe("safeFetchImage (SSRF guard)", () => {
  const blocked = [
    "http://localhost/logo.png",
    "http://127.0.0.1/logo.png",
    "http://10.0.0.5/logo.png",
    "http://172.16.4.4/logo.png",
    "http://192.168.1.1/logo.png",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/logo.png",
    "file:///etc/passwd",
    "ftp://example.com/logo.png",
    "http://internal-host/logo.png",
  ];

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("ok", { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  for (const url of blocked) {
    it(`rejects ${url}`, async () => {
      await expect(safeFetchImage(url)).rejects.toThrow();
    });
  }

  it("allows a fetch for a public host (guard passes the request to fetch)", async () => {
    const res = await safeFetchImage("http://example.com/logo.png");
    expect(res).toBeInstanceOf(Response);
  });

  it("rejects malformed URLs", async () => {
    await expect(safeFetchImage("not-a-url")).rejects.toThrow();
  });
});
