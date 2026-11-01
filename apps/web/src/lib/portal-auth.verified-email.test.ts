import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@harly/db", () => ({
  db: {},
  candidatePortalMagicLinks: {},
  candidatePortalSessions: {},
  candidates: {},
  organization: {},
  workspaceSettings: {},
}));
vi.mock("@/lib/crypto", () => ({
  decryptSecret: vi.fn(),
  isEncryptionConfigured: () => false,
}));

import { exchangeGoogleCode, exchangeLinkedInCode } from "./portal-auth";

function stubProvider(userinfo: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: string | URL | Request) => {
    const href = String(url);
    if (/token|accessToken/.test(href)) {
      return Response.json({ access_token: "token" });
    }
    return Response.json(userinfo);
  });
  vi.stubGlobal("fetch", fetchMock);
}

describe("portal OAuth sign-in requires a verified email", () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "id";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    process.env.LINKEDIN_CLIENT_ID = "id";
    process.env.LINKEDIN_CLIENT_SECRET = "secret";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects a Google account whose email is not verified", async () => {
    stubProvider({ email: "victim@example.test", verified_email: false });
    await expect(exchangeGoogleCode("c", "https://x/cb", "ws")).rejects.toThrow(/verified/i);
  });

  it("rejects a Google userinfo without a verification flag", async () => {
    stubProvider({ email: "victim@example.test" });
    await expect(exchangeGoogleCode("c", "https://x/cb", "ws")).rejects.toThrow(/verified/i);
  });

  it("accepts a verified Google email", async () => {
    stubProvider({ email: "ok@example.test", verified_email: true, given_name: "Ok" });
    await expect(exchangeGoogleCode("c", "https://x/cb", "ws")).resolves.toMatchObject({
      email: "ok@example.test",
    });
  });

  it("rejects a LinkedIn account whose email is not verified", async () => {
    stubProvider({ sub: "1", name: "V", email: "victim@example.test", email_verified: false });
    await expect(exchangeLinkedInCode("c", "https://x/cb", "ws")).rejects.toThrow(/verified/i);
  });
});
