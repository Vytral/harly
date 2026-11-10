import { beforeEach, describe, expect, it, vi } from "vitest";

const safeFetchHttp = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ssrf", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ssrf")>("@/lib/ssrf");
  return { ...actual, safeFetchHttp };
});

import {
  ClientMetadataError,
  assertValidCimdClientId,
  fetchClientMetadataDocument,
  parseClientMetadataDocument,
  sanitizeClientName,
} from "./cimd";

const ID = "https://app.example.com/oauth/client.json";
const goodDoc = {
  client_id: ID,
  client_name: "Example Agent",
  redirect_uris: ["https://app.example.com/callback"],
  token_endpoint_auth_method: "none",
  logo_uri: "https://app.example.com/logo.png",
};

function jsonResponse(body: unknown, init: { status?: number; type?: string } = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": init.type ?? "application/json" },
  });
}

beforeEach(() => {
  safeFetchHttp.mockReset();
});

describe("assertValidCimdClientId (no network)", () => {
  it("accepts a plain https URL with a path", () => {
    expect(() => assertValidCimdClientId(ID)).not.toThrow();
  });

  it.each([
    ["http://app.example.com/c.json", "https"],
    ["https://app.example.com", "path"],
    ["https://app.example.com/", "path"],
    ["https://user:pw@app.example.com/c.json", "credentials"],
    ["https://app.example.com/c.json#frag", "fragment"],
    ["https://app.example.com/a/../c.json", "canonical"],
    ["https://app.example.com:8443/c.json", "port"],
    ["https://localhost/c.json", "not allowed"],
    ["https://127.0.0.1/c.json", "not allowed"],
    ["https://169.254.169.254/latest/meta-data", "not allowed"],
    ["https://10.0.0.5/c.json", "not allowed"],
    ["https://[::1]/c.json", "not allowed"],
    ["https://8.8.8.8/c.json", "domain name"],
    ["https://metadata.localhost/c.json", "not allowed"],
    ["not a url", "valid URL"],
  ])("rejects %s", (url, fragment) => {
    expect(() => assertValidCimdClientId(url)).toThrow(ClientMetadataError);
    expect(() => assertValidCimdClientId(url)).toThrow(new RegExp(fragment, "i"));
  });
});

describe("parseClientMetadataDocument", () => {
  it("normalises a valid document", () => {
    const meta = parseClientMetadataDocument(ID, goodDoc);
    expect(meta).toMatchObject({ clientId: ID, name: "Example Agent", redirectUris: ["https://app.example.com/callback"] });
    expect(meta.logoUri).toBe("https://app.example.com/logo.png");
  });

  it("requires client_id to equal the document URL", () => {
    expect(() => parseClientMetadataDocument(ID, { ...goodDoc, client_id: "https://evil.example/x.json" })).toThrow(/does not match/);
  });

  it("refuses secrets and confidential auth methods", () => {
    expect(() => parseClientMetadataDocument(ID, { ...goodDoc, client_secret: "x" })).toThrow(/client_secret/);
    expect(() => parseClientMetadataDocument(ID, { ...goodDoc, token_endpoint_auth_method: "client_secret_basic" })).toThrow(/none/);
  });

  it("validates redirect URIs and grant types", () => {
    expect(() => parseClientMetadataDocument(ID, { ...goodDoc, redirect_uris: [] })).toThrow(/redirect_uris/);
    expect(() => parseClientMetadataDocument(ID, { ...goodDoc, redirect_uris: ["javascript:alert(1)"] })).toThrow(ClientMetadataError);
    expect(() => parseClientMetadataDocument(ID, { ...goodDoc, redirect_uris: ["http://evil.test/cb"] })).toThrow(/loopback/);
    expect(() => parseClientMetadataDocument(ID, { ...goodDoc, grant_types: ["client_credentials"] })).toThrow(/grant_types/);
    expect(() => parseClientMetadataDocument(ID, { ...goodDoc, grant_types: "authorization_code" })).toThrow(/grant_types/);
    expect(() => parseClientMetadataDocument(ID, { ...goodDoc, response_types: ["token"] })).toThrow(/response_types/);
    expect(() => parseClientMetadataDocument(ID, { ...goodDoc, grant_types: [] })).toThrow(/grant_types/);
    expect(() => parseClientMetadataDocument(ID, { ...goodDoc, response_types: [] })).toThrow(/response_types/);
    expect(() => parseClientMetadataDocument(ID, { ...goodDoc, grant_types: ["authorization_code", ""] })).toThrow(/grant_types/);
    expect(() => parseClientMetadataDocument(ID, { ...goodDoc, response_types: ["code", ""] })).toThrow(/response_types/);
  });

  it("ignores extra grant types that real clients publish", () => {
    // Verbatim shape of https://claude.ai/oauth/mcp-oauth-client-metadata (2026-11).
    const claudeId = "https://claude.ai/oauth/mcp-oauth-client-metadata";
    const claude = parseClientMetadataDocument(claudeId, {
      client_id: claudeId,
      client_name: "Claude",
      client_uri: "https://claude.ai",
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
      grant_types: ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:jwt-bearer"],
      response_types: ["code", "urn:example:extra"],
      token_endpoint_auth_method: "none",
    });
    expect(claude).toMatchObject({ name: "Claude", redirectUris: ["https://claude.ai/api/mcp/auth_callback"] });

    // Shape of https://vscode.dev/oauth/client-metadata.json (2026-11).
    const vscodeId = "https://vscode.dev/oauth/client-metadata.json";
    const vscode = parseClientMetadataDocument(vscodeId, {
      client_id: vscodeId,
      client_name: "Visual Studio Code",
      application_type: "native",
      grant_types: ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:device_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      redirect_uris: ["http://127.0.0.1:33418/", "https://vscode.dev/redirect"],
    });
    expect(vscode.redirectUris).toEqual(["http://127.0.0.1:33418/", "https://vscode.dev/redirect"]);
  });

  it("falls back to the host for a missing name and drops unsafe logo URLs", () => {
    const meta = parseClientMetadataDocument(ID, { ...goodDoc, client_name: "  ", logo_uri: "javascript:x" });
    expect(meta.name).toBe("app.example.com");
    expect(meta.logoUri).toBeNull();
  });

  it("strips control and bidi characters from names", () => {
    expect(sanitizeClientName("Cla‮ude\u0000 \n Agent")).toBe("Claude Agent");
  });
});

describe("fetchClientMetadataDocument", () => {
  it("fetches through the SSRF-safe transport", async () => {
    safeFetchHttp.mockResolvedValue(jsonResponse(goodDoc));
    const meta = await fetchClientMetadataDocument(ID);
    expect(meta.name).toBe("Example Agent");
    expect(safeFetchHttp).toHaveBeenCalledWith(ID, expect.objectContaining({ method: "GET" }));
  });

  it("rejects a private-network target before any request is made", async () => {
    await expect(fetchClientMetadataDocument("https://169.254.169.254/latest")).rejects.toBeInstanceOf(ClientMetadataError);
    expect(safeFetchHttp).not.toHaveBeenCalled();
  });

  it("maps a transport-level SSRF rejection (DNS resolving to a private IP) to a metadata error", async () => {
    safeFetchHttp.mockImplementation(async () => {
      throw new Error("Hostname resolves to a blocked network.");
    });
    const error = await fetchClientMetadataDocument(ID).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ClientMetadataError);
    expect((error as Error).message).toMatch(/could not be fetched/);
  });

  it("refuses redirects, non-JSON, oversized and invalid bodies", async () => {
    safeFetchHttp.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } }));
    await expect(fetchClientMetadataDocument(ID)).rejects.toThrow(/HTTP 302/);
    safeFetchHttp.mockResolvedValueOnce(jsonResponse(goodDoc, { type: "text/html" }));
    await expect(fetchClientMetadataDocument(ID)).rejects.toThrow(/application\/json/);
    safeFetchHttp.mockResolvedValueOnce(jsonResponse("x".repeat(70 * 1024)));
    await expect(fetchClientMetadataDocument(ID)).rejects.toThrow(/too large/);
    safeFetchHttp.mockResolvedValueOnce(jsonResponse("{nope"));
    await expect(fetchClientMetadataDocument(ID)).rejects.toThrow(/valid JSON/);
  });
});
