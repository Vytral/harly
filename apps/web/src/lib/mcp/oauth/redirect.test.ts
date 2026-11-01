import { describe, expect, it } from "vitest";

import { buildRedirect, matchRedirectUri, redirectDisplayHost, validateRedirectUriForRegistration } from "./redirect";

describe("matchRedirectUri", () => {
  const registered = ["https://claude.ai/api/mcp/auth_callback", "http://127.0.0.1/callback", "cursor://anysphere.cursor-retrieval/oauth/callback"];

  it("requires an exact match for non-loopback URIs", () => {
    expect(matchRedirectUri("https://claude.ai/api/mcp/auth_callback", registered)).toBe(true);
    expect(matchRedirectUri("https://claude.ai/api/mcp/auth_callback/", registered)).toBe(false);
    expect(matchRedirectUri("https://claude.ai/api/mcp/auth_callback?x=1", registered)).toBe(false);
    expect(matchRedirectUri("https://evil.claude.ai/api/mcp/auth_callback", registered)).toBe(false);
    expect(matchRedirectUri("cursor://anysphere.cursor-retrieval/oauth/callback", registered)).toBe(true);
    expect(matchRedirectUri("cursor://anysphere.cursor-retrieval/oauth/other", registered)).toBe(false);
  });

  it("ignores the port for loopback http redirects (RFC 8252)", () => {
    expect(matchRedirectUri("http://127.0.0.1:53127/callback", registered)).toBe(true);
    expect(matchRedirectUri("http://127.0.0.1:53127/other", registered)).toBe(false);
    expect(matchRedirectUri("http://localhost:53127/callback", registered)).toBe(false);
    expect(matchRedirectUri("http://localhost:8080/cb", ["http://localhost/cb"])).toBe(true);
    expect(matchRedirectUri("http://[::1]:9/cb", ["http://[::1]/cb"])).toBe(true);
  });

  it("never lets a loopback registration match a remote host or https", () => {
    expect(matchRedirectUri("http://127.0.0.1.evil.com/callback", registered)).toBe(false);
    expect(matchRedirectUri("https://127.0.0.1:53127/callback", registered)).toBe(false);
  });

  it("rejects fragments and garbage", () => {
    expect(matchRedirectUri("https://claude.ai/api/mcp/auth_callback#x", registered)).toBe(false);
    expect(matchRedirectUri("not a url", registered)).toBe(false);
  });
});

describe("validateRedirectUriForRegistration", () => {
  it("accepts https, loopback http and native schemes", () => {
    expect(validateRedirectUriForRegistration("https://chatgpt.com/connector_platform_oauth_redirect")).toBeNull();
    expect(validateRedirectUriForRegistration("http://localhost:3118/callback")).toBeNull();
    expect(validateRedirectUriForRegistration("vscode://ms-vscode.mcp/callback")).toBeNull();
  });

  it("refuses dangerous or leaky URIs", () => {
    for (const uri of [
      "http://example.com/cb",
      "javascript:alert(1)",
      "data:text/html,hi",
      "file:///etc/passwd",
      "https://example.com/cb#frag",
      "https://user:pw@example.com/cb",
      "https://localhost/cb",
      "nonsense",
    ]) {
      expect(validateRedirectUriForRegistration(uri), uri).not.toBeNull();
    }
  });
});

describe("helpers", () => {
  it("shows a readable host", () => {
    expect(redirectDisplayHost("https://claude.ai/api/mcp/auth_callback")).toBe("claude.ai");
    expect(redirectDisplayHost("http://127.0.0.1:1234/cb")).toBe("localhost (this device)");
    expect(redirectDisplayHost("cursor://anysphere.cursor-retrieval/x")).toBe("cursor://anysphere.cursor-retrieval");
  });

  it("builds redirects preserving existing query and skipping undefined", () => {
    const url = buildRedirect("https://app.test/cb?x=1", { code: "abc", state: undefined, iss: "https://h.test" });
    expect(url).toBe("https://app.test/cb?x=1&code=abc&iss=https%3A%2F%2Fh.test");
  });
});
