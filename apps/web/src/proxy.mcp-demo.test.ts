import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { proxy } from "./proxy";

function request(path: string) {
  return new NextRequest(new URL(path, "http://localhost:3000"));
}

describe("proxy: MCP on the public demo", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    "/mcp",
    "/oauth/authorize",
    "/oauth/token",
    "/oauth/register",
    "/oauth/consent",
    "/.well-known/oauth-authorization-server",
    "/.well-known/oauth-protected-resource/mcp",
    "/.well-known/openid-configuration",
  ])("returns 404 for %s in demo mode", async (path) => {
    vi.stubEnv("DEMO_MODE", "true");
    const response = await proxy(request(path));
    expect(response.status).toBe(404);
  });

  it("leaves MCP paths alone outside demo mode", async () => {
    vi.stubEnv("DEMO_MODE", "false");
    const response = await proxy(request("/.well-known/oauth-authorization-server"));
    expect(response.status).not.toBe(404);
  });
});
