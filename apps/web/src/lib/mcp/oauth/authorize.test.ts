import { describe, expect, it, vi } from "vitest";

vi.mock("@harly/db", () => ({}));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/public-origin", () => ({ getHarlyPublicOrigin: () => "https://harly.acme.com" }));
vi.mock("./clients", () => ({ resolveOAuthClient: vi.fn(), markClientUsed: vi.fn() }));

import { failureRedirectUrl, normalizeResource, validateAuthorizeRequest } from "./authorize";
import { pkceS256Challenge } from "./crypto";
import type { ResolvedOAuthClient } from "./clients";

const RESOURCE = "https://harly.acme.com/mcp";
const client: ResolvedOAuthClient = {
  clientId: "hmc_abc",
  name: "Test Agent",
  redirectUris: ["https://agent.test/cb", "http://127.0.0.1/cb"],
  logoUri: null,
  clientUri: null,
  source: "dcr",
  known: null,
};
const challenge = pkceS256Challenge("v".repeat(50));

function params(overrides: Record<string, string | undefined> = {}) {
  const base: Record<string, string | undefined> = {
    response_type: "code",
    client_id: "hmc_abc",
    redirect_uri: "https://agent.test/cb",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "xyz",
    resource: RESOURCE,
    scope: "candidates:read jobs:read",
    ...overrides,
  };
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) if (v !== undefined) out.set(k, v);
  return out;
}
const deps = { resolveClient: async (id: string) => (id === "hmc_abc" ? client : null), resource: RESOURCE };

describe("validateAuthorizeRequest", () => {
  it("accepts a well-formed request", async () => {
    const result = await validateAuthorizeRequest(params(), deps);
    expect(result).toMatchObject({ ok: true, request: { redirectUri: "https://agent.test/cb", state: "xyz", scopes: ["candidates:read", "jobs:read"], resource: RESOURCE } });
  });

  it("accepts loopback redirects on any port and a trailing-slash resource", async () => {
    const result = await validateAuthorizeRequest(params({ redirect_uri: "http://127.0.0.1:5555/cb", resource: `${RESOURCE}/` }), deps);
    expect(result.ok).toBe(true);
  });

  it("defaults resource and scope when omitted", async () => {
    const result = await validateAuthorizeRequest(params({ resource: undefined, scope: undefined }), deps);
    expect(result.ok && result.request.resource).toBe(RESOURCE);
    expect(result.ok && result.request.scopes.length).toBeGreaterThan(5);
  });

  it("never redirects for an unknown client or a mismatched redirect_uri", async () => {
    expect(await validateAuthorizeRequest(params({ client_id: "nope" }), deps)).toMatchObject({ ok: false, kind: "page", error: "invalid_client" });
    expect(await validateAuthorizeRequest(params({ redirect_uri: "https://agent.test/cb2" }), deps)).toMatchObject({ ok: false, kind: "page" });
    expect(await validateAuthorizeRequest(params({ redirect_uri: undefined }), deps)).toMatchObject({ ok: false, kind: "page" });
    expect(await validateAuthorizeRequest(params({ client_id: undefined }), deps)).toMatchObject({ ok: false, kind: "page" });
  });

  it("requires PKCE S256", async () => {
    expect(await validateAuthorizeRequest(params({ code_challenge: undefined }), deps)).toMatchObject({ ok: false, kind: "redirect", error: "invalid_request" });
    expect(await validateAuthorizeRequest(params({ code_challenge_method: "plain" }), deps)).toMatchObject({ ok: false, kind: "redirect", error: "invalid_request" });
    expect(await validateAuthorizeRequest(params({ code_challenge_method: undefined }), deps)).toMatchObject({ ok: false, error: "invalid_request" });
    expect(await validateAuthorizeRequest(params({ code_challenge: "short" }), deps)).toMatchObject({ ok: false, error: "invalid_request" });
  });

  it("rejects other response types, foreign resources and unsupported scopes via redirect", async () => {
    expect(await validateAuthorizeRequest(params({ response_type: "token" }), deps)).toMatchObject({ ok: false, kind: "redirect", error: "unsupported_response_type" });
    expect(await validateAuthorizeRequest(params({ resource: "https://other.example/mcp" }), deps)).toMatchObject({ ok: false, kind: "redirect", error: "invalid_target" });
    expect(await validateAuthorizeRequest(params({ scope: "root admin" }), deps)).toMatchObject({ ok: false, kind: "redirect", error: "invalid_scope" });
  });

  it("builds error redirects with state and iss (RFC 9207)", async () => {
    const result = await validateAuthorizeRequest(params({ response_type: "token" }), deps);
    if (result.ok || result.kind !== "redirect") throw new Error("expected redirect failure");
    const url = new URL(failureRedirectUrl(result));
    expect(url.searchParams.get("error")).toBe("unsupported_response_type");
    expect(url.searchParams.get("state")).toBe("xyz");
    expect(url.searchParams.get("iss")).toBe("https://harly.acme.com");
  });
});

it("normalizes resource trailing slashes", () => {
  expect(normalizeResource("https://x.test/mcp///")).toBe("https://x.test/mcp");
});
