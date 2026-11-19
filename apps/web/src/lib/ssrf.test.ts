import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn() }));

vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));

import { isBlockedHost, pinnedLookup, resolveSafeAddress, safeFetchHttp } from "./ssrf";

describe("SSRF host filtering", () => {
  beforeEach(() => {
    mocks.lookup.mockReset();
  });

  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "[::1]",
    "::",
    "[fe81::1]",
    "[febf::1]",
    "[::ffff:127.0.0.1]",
    "[0:0:0:0:0:ffff:169.254.169.254]",
    "0.0.0.0",
    "localhost",
    "[64:ff9b::7f00:1]",
    "[64:ff9b::a9fe:a9fe]",
    "[64:ff9b::c0a8:101]",
    "[64:ff9b::10.0.0.1]",
    "[64:ff9b:1::1]",
    "[2002:7f00:1::1]",
    "[2002:a9fe:a9fe::]",
    "[2002:0a00:0001::1]",
  ])("blocks private destination %s", (host) => {
    expect(isBlockedHost(host)).toBe(true);
  });

  it("allows a public IP", () => {
    expect(isBlockedHost("8.8.8.8")).toBe(false);
    expect(isBlockedHost("[::ffff:8.8.8.8]")).toBe(false);
    expect(isBlockedHost("[64:ff9b::808:808]")).toBe(false);
    expect(isBlockedHost("[2002:808:808::1]")).toBe(false);
  });

  it("rejects an IPv4-mapped loopback before opening an outbound request", async () => {
    await expect(
      safeFetchHttp("http://[::ffff:127.0.0.1]/health"),
    ).rejects.toThrow("blocked host");
  });

  it("rejects a hostname when any DNS answer is private", async () => {
    mocks.lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);

    await expect(resolveSafeAddress("attacker.example")).rejects.toThrow(
      "blocked network",
    );
  });

  it("pins a public DNS answer for the outbound connection", async () => {
    mocks.lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ]);

    await expect(resolveSafeAddress("public.example")).resolves.toEqual({
      address: "93.184.216.34",
      family: 4,
    });
    expect(mocks.lookup).toHaveBeenCalledWith("public.example", {
      all: true,
      verbatim: true,
    });
  });

  it("permits private DNS only for the explicit development opt-in", async () => {
    mocks.lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);

    await expect(resolveSafeAddress("dev-webhook.example", true)).resolves.toEqual({
      address: "127.0.0.1",
      family: 4,
    });
  });
});

describe("pinned outbound requests", () => {
  beforeEach(() => {
    mocks.lookup.mockReset();
  });

  it("answers both single and all-address lookups with the validated address", () => {
    const lookup = pinnedLookup({ address: "93.184.216.34", family: 4 });
    const single = vi.fn();
    const all = vi.fn();

    lookup("public.example", { all: false }, single);
    lookup("public.example", { all: true }, all);

    expect(single).toHaveBeenCalledWith(null, "93.184.216.34", 4);
    expect(all).toHaveBeenCalledWith(null, [{ address: "93.184.216.34", family: 4 }]);
  });

  it("reaches a hostname through the pinned address (Happy Eyeballs lookup)", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"ok":true}');
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    mocks.lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);

    try {
      const response = await safeFetchHttp(`http://dev-metadata.example:${port}/doc`, {}, true);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
