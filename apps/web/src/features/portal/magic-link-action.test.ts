import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  magicLink: false,
  createMagicLinkToken: vi.fn(async () => "tok"),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({}),
  headers: async () => new Headers(),
}));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), createElement: vi.fn() }));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(), eq: vi.fn(), asc: vi.fn(), count: vi.fn(), desc: vi.fn(), gt: vi.fn(), inArray: vi.fn(), isNull: vi.fn(),
  sql: Object.assign(vi.fn(), { raw: vi.fn() }),
}));
vi.mock("@harly/db", () => {
  const chain: unknown = new Proxy(function () {}, {
    get: (_t, p) => (p === "then" ? (r: (v: unknown) => void) => r([{ count: 0 }]) : () => chain),
    apply: () => chain,
  });
  const tables = Object.fromEntries(
    [
      "applications", "applicationStageHistory", "activityEvents", "applicationAnswers",
      "applicationQuestions", "candidateFiles", "jobs", "offers", "signatureRecipients",
      "workspaceSettings", "consentRecords", "candidatePortalMagicLinks", "member", "organization", "user",
    ].map((k) => [k, {}]),
  );
  return { db: chain, ...tables };
});
vi.mock("@harly/emails", () => ({ PortalMagicLinkEmail: () => null, portalMagicLinkSubject: () => "s" }));
vi.mock("@/lib/portal-auth", () => ({
  PORTAL_SESSION_COOKIE: "c",
  createMagicLinkToken: m.createMagicLinkToken,
  deletePortalSession: vi.fn(),
  getSinglePortalWorkspace: async () => ({ id: "ws1", slug: "a" }),
  resolvePortalSession: vi.fn(),
}));
vi.mock("@/lib/portal-auth-methods", () => ({
  getPortalAuthMethods: async () => ({ magicLink: m.magicLink }),
}));
vi.mock("@/lib/email", () => ({ getWorkspaceEmailSender: async () => ({ send: vi.fn() }) }));
vi.mock("@/server/api/ratelimit", () => ({ clientIp: () => "1.1.1.1", enforceRateLimit: vi.fn(async () => undefined) }));
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }) }));
vi.mock("@/lib/public-origin", () => ({ getHarlyPublicOrigin: () => "http://localhost:3000" }));
vi.mock("@/lib/esign/client", () => ({}));
vi.mock("@/lib/esign/offer-signing", () => ({}));
vi.mock("@/features/pipeline/stage-resolver", () => ({}));
vi.mock("@/features/jobs/config", () => ({}));
vi.mock("@/features/portal/application-validation", () => ({}));
vi.mock("@/features/applications/notifications", () => ({}));
vi.mock("@/features/applications/resume-upload", () => ({}));
vi.mock("@/features/applications/pipeline-order", () => ({}));
vi.mock("@/features/applications/data", () => ({}));
vi.mock("@/server/events/emit", () => ({}));
vi.mock("@/server/webhooks/emit", () => ({}));
vi.mock("@/features/offers/core", () => ({}));

import { sendPortalMagicLinkAction } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendPortalMagicLinkAction server-side gating", () => {
  it("refuses and creates no token when magic link is not available", async () => {
    m.magicLink = false;
    const r = await sendPortalMagicLinkAction("a@example.com");
    expect(r.ok).toBe(false);
    expect(m.createMagicLinkToken).not.toHaveBeenCalled();
  });

  it("issues a token when magic link is available", async () => {
    m.magicLink = true;
    const r = await sendPortalMagicLinkAction("a@example.com");
    expect(r.ok).toBe(true);
    expect(m.createMagicLinkToken).toHaveBeenCalledWith("ws1", "a@example.com");
  });
});
