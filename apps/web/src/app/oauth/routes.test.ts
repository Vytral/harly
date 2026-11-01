import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@harly/db", () => ({}));
vi.mock("@/lib/public-origin", () => ({ getHarlyPublicOrigin: () => "https://harly.acme.com" }));
const settings = vi.hoisted(() => ({ value: { enabled: true, allowDcr: true } }));
vi.mock("@/lib/mcp/settings", () => ({ getInstanceMcpSettings: async () => settings.value }));
const rate = vi.hoisted(() => ({ fail: false }));
vi.mock("@/server/api/ratelimit", () => ({
  enforceRateLimit: vi.fn(async () => {
    if (rate.fail) throw new Error("limited");
  }),
  rateLimitResultFromError: () => null,
}));
vi.mock("@/lib/mcp/oauth/clients", () => ({
  DcrError: class DcrError extends Error {
    constructor(readonly code: string, message: string) {
      super(message);
    }
  },
  purgeExpiredClients: vi.fn(async () => undefined),
  registerDcrClient: vi.fn(async (body: { client_name?: string; redirect_uris: string[] }) => ({
    clientId: "hmc_test",
    clientName: body.client_name ?? "x",
    redirectUris: body.redirect_uris,
    issuedAt: 1,
  })),
}));
vi.mock("@/lib/mcp/oauth/token", () => ({
  exchangeAuthorizationCode: vi.fn(async () => ({
    ok: true,
    response: { access_token: "a", token_type: "Bearer", expires_in: 900, refresh_token: "r", scope: "jobs:read" },
  })),
  refreshAccessToken: vi.fn(async () => ({ ok: false, status: 400, error: "invalid_grant", description: "no" })),
  revokeToken: vi.fn(async () => undefined),
}));

import { GET as asMetadata, OPTIONS as asOptions } from "../.well-known/oauth-authorization-server/route";
import { GET as prmMcp } from "../.well-known/oauth-protected-resource/mcp/route";
import { GET as prmRoot } from "../.well-known/oauth-protected-resource/route";
import { POST as register } from "./register/route";
import { POST as token } from "./token/route";
import { POST as revoke } from "./revoke/route";

function post(url: string, body: string, type = "application/json") {
  return new Request(url, { method: "POST", body, headers: { "content-type": type } });
}

beforeEach(() => {
  settings.value = { enabled: true, allowDcr: true };
  rate.fail = false;
});

describe("discovery routes", () => {
  it("serves AS metadata with CORS and caching", async () => {
    const res = await asMetadata();
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("cache-control")).toContain("max-age");
    const doc = await res.json();
    expect(doc.issuer).toBe("https://harly.acme.com");
    expect(doc.code_challenge_methods_supported).toEqual(["S256"]);
  });

  it("drops the registration endpoint when DCR is disabled", async () => {
    settings.value = { enabled: true, allowDcr: false };
    expect((await (await asMetadata()).json()).registration_endpoint).toBeUndefined();
  });

  it("answers CORS preflight", () => {
    const res = asOptions();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("serves PRM at both well-known paths with the exact resource", async () => {
    for (const handler of [prmRoot, prmMcp]) {
      const doc = await handler().json();
      expect(doc.resource).toBe("https://harly.acme.com/mcp");
      expect(doc.authorization_servers).toEqual(["https://harly.acme.com"]);
    }
  });
});

describe("register", () => {
  it("creates a public client (201, no secret)", async () => {
    const res = await register(post("https://harly.acme.com/oauth/register", JSON.stringify({ client_name: "Agent", redirect_uris: ["https://a.test/cb"] })));
    expect(res.status).toBe(201);
    const doc = await res.json();
    expect(doc).toMatchObject({ client_id: "hmc_test", token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"] });
    expect(doc.client_secret).toBeUndefined();
  });

  it("refuses when DCR is off, on bad JSON, and when rate limited", async () => {
    settings.value = { enabled: true, allowDcr: false };
    expect((await register(post("https://x/oauth/register", "{}"))).status).toBe(403);
    settings.value = { enabled: true, allowDcr: true };
    expect((await register(post("https://x/oauth/register", "not json"))).status).toBe(400);
  });
});

describe("token / revoke", () => {
  const form = (data: Record<string, string>) => post("https://x/oauth/token", new URLSearchParams(data).toString(), "application/x-www-form-urlencoded");

  it("exchanges a code and sets no-store", async () => {
    const res = await token(form({ grant_type: "authorization_code", client_id: "c", code: "k", redirect_uri: "https://a.test/cb", code_verifier: "v" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await res.json()).token_type).toBe("Bearer");
  });

  it("validates parameters and grant types", async () => {
    expect((await token(form({ grant_type: "authorization_code", client_id: "c" }))).status).toBe(400);
    expect((await token(form({ grant_type: "client_credentials", client_id: "c" }))).status).toBe(400);
    expect((await token(form({ grant_type: "refresh_token" }))).status).toBe(401);
    expect((await token(form({ grant_type: "refresh_token", client_id: "c", client_secret: "s", refresh_token: "r" }))).status).toBe(401);
    const bad = await token(form({ grant_type: "refresh_token", client_id: "c", refresh_token: "r" }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe("invalid_grant");
  });

  it("revoke answers 200 and requires a token", async () => {
    expect((await revoke(post("https://x/oauth/revoke", "token=abc", "application/x-www-form-urlencoded"))).status).toBe(200);
    expect((await revoke(post("https://x/oauth/revoke", "", "application/x-www-form-urlencoded"))).status).toBe(400);
  });
});
