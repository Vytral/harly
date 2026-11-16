import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  consume: vi.fn(),
  findOrCreate: vi.fn(),
  enabled: vi.fn(),
  methods: vi.fn(),
  establish: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/portal-auth", () => ({
  consumeMagicLinkToken: m.consume,
  findOrCreateCandidateByEmail: m.findOrCreate,
  isPortalEnabled: m.enabled,
}));
vi.mock("@/lib/portal-credentials", () => ({ auditPortalEvent: m.audit }));
vi.mock("@/lib/portal-session", () => ({ establishPortalSession: m.establish }));
vi.mock("@/lib/portal-auth-methods", () => ({ getPortalAuthMethods: m.methods }));
vi.mock("@/lib/public-origin", () => ({
  getHarlyPublicOrigin: () => "https://ats.example.test",
}));

import { GET, POST } from "./route";

function post(token: string | null, headers: Record<string, string> = {}) {
  const body = new URLSearchParams(token === null ? {} : { token });
  return new NextRequest("https://ats.example.test/api/portal/auth/magic", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.consume.mockResolvedValue({ workspaceId: "ws1", email: "a@example.test" });
  m.enabled.mockResolvedValue(true);
  m.methods.mockResolvedValue({ magicLink: true });
  m.findOrCreate.mockResolvedValue("cand1");
});

describe("portal magic link route", () => {
  it("GET never consumes the token and forwards to the confirm page", async () => {
    const res = await GET(
      new NextRequest("https://ats.example.test/api/portal/auth/magic?token=abc"),
    );
    expect(m.consume).not.toHaveBeenCalled();
    expect(m.establish).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe(
      "https://ats.example.test/portal/magic?token=abc",
    );
  });

  it("GET without a token goes back to login", async () => {
    const res = await GET(
      new NextRequest("https://ats.example.test/api/portal/auth/magic"),
    );
    expect(res.headers.get("location")).toContain("error=missing_token");
  });

  it("POST consumes the token, starts a session and redirects with 303", async () => {
    const res = await POST(post("abc"));
    expect(m.consume).toHaveBeenCalledWith("abc");
    expect(m.establish).toHaveBeenCalledWith("cand1", "ws1", undefined);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      "https://ats.example.test/portal/dashboard",
    );
  });

  it("POST with an invalid token does not start a session", async () => {
    m.consume.mockResolvedValue(null);
    const res = await POST(post("bad"));
    expect(m.establish).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toContain("error=invalid_token");
  });

  it("POST without a token is rejected", async () => {
    const res = await POST(post(null));
    expect(m.consume).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toContain("error=missing_token");
  });

  it("POST refuses cross-site submissions without consuming the token", async () => {
    const res = await POST(post("abc", { "sec-fetch-site": "cross-site" }));
    expect(m.consume).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toContain("error=invalid_token");
  });
});
