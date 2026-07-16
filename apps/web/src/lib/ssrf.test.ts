import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn() }));

vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));

import { isBlockedHost, resolveSafeAddress } from "./ssrf";

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
    "localhost",
  ])("blocks private destination %s", (host) => {
    expect(isBlockedHost(host)).toBe(true);
  });

  it("allows a public IP", () => {
    expect(isBlockedHost("8.8.8.8")).toBe(false);
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
