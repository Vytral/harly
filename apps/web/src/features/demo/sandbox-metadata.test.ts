import { describe, expect, it } from "vitest";

import {
  isSandboxExpired,
  parseSandboxMetadata,
  serializeSandboxMetadata,
} from "./sandbox-metadata";

describe("sandbox metadata", () => {
  it("round-trips the marker through organization.metadata", () => {
    const raw = serializeSandboxMetadata({
      expiresAt: "2030-01-01T00:00:00.000Z",
      style: "join",
    });
    expect(parseSandboxMetadata(raw)).toEqual({
      expiresAt: "2030-01-01T00:00:00.000Z",
      style: "join",
    });
  });

  it("does not treat ordinary or malformed metadata as a sandbox", () => {
    expect(parseSandboxMetadata(null)).toBeNull();
    expect(parseSandboxMetadata("")).toBeNull();
    expect(parseSandboxMetadata("not json")).toBeNull();
    expect(parseSandboxMetadata(JSON.stringify({ plan: "pro" }))).toBeNull();
    expect(
      parseSandboxMetadata(JSON.stringify({ harlyDemoSandbox: { expiresAt: "nope" } })),
    ).toBeNull();
  });

  it("expires at the boundary", () => {
    const meta = { expiresAt: "2030-01-01T00:00:00.000Z", style: "" };
    expect(isSandboxExpired(meta, new Date("2029-12-31T23:59:59.000Z"))).toBe(false);
    expect(isSandboxExpired(meta, new Date("2030-01-01T00:00:00.000Z"))).toBe(true);
  });
});
