import { describe, expect, it } from "vitest";

import { extractBearerToken, insufficientScopeResponse, isAllowedOrigin, unauthorizedResponse } from "./http";
import { buildServerInfo, resolveIconUrl } from "./server-info";
import { summarizeArgs } from "./summarize";

const META = "https://harly.test/.well-known/oauth-protected-resource/mcp";

describe("bearer parsing", () => {
  it("reads a Bearer token and nothing else", () => {
    const make = (value?: string) => new Request("https://x.test", { headers: value ? { authorization: value } : {} });
    expect(extractBearerToken(make("Bearer abc.def"))).toBe("abc.def");
    expect(extractBearerToken(make("bearer abc"))).toBe("abc");
    expect(extractBearerToken(make("Basic abc"))).toBeNull();
    expect(extractBearerToken(make())).toBeNull();
    expect(extractBearerToken(new Request("https://x.test/?access_token=abc"))).toBeNull();
  });
});

describe("challenges", () => {
  it("401 without a token points at the protected resource metadata", () => {
    const response = unauthorizedResponse(META);
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(`Bearer resource_metadata="${META}"`);
  });

  it("403 insufficient_scope names the scope", () => {
    const response = insufficientScopeResponse("jobs:write", META);
    expect(response.status).toBe(403);
    expect(response.headers.get("www-authenticate")).toBe(
      `Bearer error="insufficient_scope", scope="jobs:write", resource_metadata="${META}"`,
    );
  });
});

describe("isAllowedOrigin", () => {
  it("allows the instance itself and loopback, refuses everyone else", () => {
    expect(isAllowedOrigin("https://harly.test", "https://harly.test", "")).toBe(true);
    expect(isAllowedOrigin("http://localhost:6274", "https://harly.test", "")).toBe(true);
    expect(isAllowedOrigin("https://evil.example", "https://harly.test", "")).toBe(false);
    expect(isAllowedOrigin("null", "https://harly.test", "")).toBe(false);
  });

  it("honours an explicit allow list", () => {
    expect(isAllowedOrigin("https://tools.acme.com", "https://harly.test", "https://tools.acme.com/, https://b.test")).toBe(true);
  });
});

describe("server info", () => {
  it("titles the server with the workspace name and points icons at the instance", () => {
    const info = buildServerInfo({ workspaceName: "Acme", logo: "/api/storage/logo.png", appOrigin: "https://harly.test", version: "0.2.4" });
    expect(info).toMatchObject({ name: "harly", title: "Acme · Harly", version: "0.2.4", websiteUrl: "https://harly.test" });
    expect(info.icons?.[0]).toMatchObject({ src: "https://harly.test/api/storage/logo.png", mimeType: "image/png" });
  });

  it("falls back to the Harly mark for missing, inline or non-http logos", () => {
    for (const logo of [null, "", "data:image/png;base64,AAAA", "javascript:alert(1)"]) {
      expect(resolveIconUrl(logo, "https://harly.test")).toBe("https://harly.test/favicon.svg");
    }
    expect(resolveIconUrl("https://cdn.acme.com/l.svg", "https://harly.test")).toBe("https://cdn.acme.com/l.svg");
  });
});

describe("audit argument summary", () => {
  it("keeps ids, hides free text and PII, counts lists", () => {
    expect(
      summarizeArgs({
        applicationId: "a1",
        toStageId: "s2",
        body: "Dear Ada, ...",
        candidateEmail: "ada@x.com",
        tags: ["a", "b"],
        dryRun: true,
        long: "z".repeat(200),
      }),
    ).toEqual({
      applicationId: "a1",
      toStageId: "s2",
      body: "[13 chars]",
      candidateEmail: "[9 chars]",
      tags: "[2 items]",
      dryRun: true,
      long: "[200 chars]",
    });
  });
});
