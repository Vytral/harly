import { describe, expect, it } from "vitest";

import { MCP_SCOPES } from "../types";
import { buildAuthorizationServerMetadata, buildProtectedResourceMetadata } from "./metadata";
import { clampScopes, parseRequestedScopes } from "./scopes";

describe("scopes", () => {
  it("defaults to every scope when none are requested", () => {
    expect(parseRequestedScopes(undefined)).toEqual([...MCP_SCOPES]);
    expect(parseRequestedScopes("   ")).toEqual([...MCP_SCOPES]);
  });

  it("keeps known scopes, drops unknown ones and ignores offline_access", () => {
    expect(parseRequestedScopes("jobs:read offline_access bogus candidates:read")).toEqual(["candidates:read", "jobs:read"]);
  });

  it("rejects a request naming only unsupported scopes", () => {
    expect(parseRequestedScopes("bogus other")).toBeNull();
  });

  it("treats offline_access alone as the default set", () => {
    expect(parseRequestedScopes("offline_access")).toEqual([...MCP_SCOPES]);
  });

  it("clamps to the workspace policy", () => {
    expect(clampScopes(["jobs:read", "jobs:write"], ["jobs:read"])).toEqual(["jobs:read"]);
  });
});

describe("metadata documents", () => {
  const origin = "https://harly.acme.com";

  it("AS metadata advertises S256 only, public clients, CIMD and DCR", () => {
    const doc = buildAuthorizationServerMetadata(origin);
    expect(doc.issuer).toBe(origin);
    expect(doc.authorization_endpoint).toBe(`${origin}/oauth/authorize`);
    expect(doc.token_endpoint).toBe(`${origin}/oauth/token`);
    expect(doc.revocation_endpoint).toBe(`${origin}/oauth/revoke`);
    expect(doc.registration_endpoint).toBe(`${origin}/oauth/register`);
    expect(doc.code_challenge_methods_supported).toEqual(["S256"]);
    expect(doc.token_endpoint_auth_methods_supported).toEqual(["none"]);
    expect(doc.client_id_metadata_document_supported).toBe(true);
    expect(doc.authorization_response_iss_parameter_supported).toBe(true);
    expect(doc.grant_types_supported).toEqual(["authorization_code", "refresh_token"]);
    expect(doc.scopes_supported).toContain("offline_access");
    expect(doc.scopes_supported).toContain("candidates:read");
  });

  it("omits the registration endpoint when DCR is off", () => {
    expect("registration_endpoint" in buildAuthorizationServerMetadata(origin, { allowDcr: false })).toBe(false);
  });

  it("PRM names the exact resource URL and a single authorization server", () => {
    const doc = buildProtectedResourceMetadata(origin);
    expect(doc.resource).toBe(`${origin}/mcp`);
    expect(doc.authorization_servers).toEqual([origin]);
    expect(doc.bearer_methods_supported).toEqual(["header"]);
    expect(doc.scopes_supported).not.toContain("offline_access");
  });
});
