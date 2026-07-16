import { describe, expect, it } from "vitest";

import { isBlockedHost } from "./ssrf";

describe("SSRF host filtering", () => {
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
});
