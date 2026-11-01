import { describe, expect, it, vi } from "vitest";

vi.mock("@harly/db", () => ({}));

import { resolveMcpSettings } from "./settings";
import { MCP_SCOPES } from "./types";

describe("resolveMcpSettings", () => {
  it("defaults to enabled, any client, DCR on, every scope when no row exists", () => {
    expect(resolveMcpSettings("ws")).toEqual({
      workspaceId: "ws",
      enabled: true,
      clientMode: "any",
      allowDcr: true,
      allowedScopes: [...MCP_SCOPES],
    });
  });

  it("applies stored values and filters max_scopes to known scopes", () => {
    const settings = resolveMcpSettings("ws", {
      enabled: false,
      clientMode: "known_only",
      allowDcr: false,
      maxScopes: ["jobs:read", "bogus"],
    });
    expect(settings).toMatchObject({ enabled: false, clientMode: "known_only", allowDcr: false, allowedScopes: ["jobs:read"] });
  });

  it("falls back to 'any' for an unrecognised client mode", () => {
    expect(resolveMcpSettings("ws", { enabled: true, clientMode: "weird", allowDcr: true, maxScopes: null }).clientMode).toBe("any");
  });
});

describe("isMcpEnabledForWorkspace", () => {
  it("is always off on the public demo, without reading settings", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const { isMcpEnabledForWorkspace } = await import("./settings");
    await expect(isMcpEnabledForWorkspace("ws")).resolves.toBe(false);
    vi.unstubAllEnvs();
  });
});
