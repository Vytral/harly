vi.mock("next-intl/server", async () => (await import("@/test-support/intl-server-mock")).intlServerMock);
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  methods: {
    password: true,
    accessCode: true,
    magicLink: false,
    passkey: false,
    oauth: { google: false, github: false, linkedin: false },
  } as Record<string, unknown>,
  rateOk: true,
  session: null as { candidateId: string; workspaceId: string; email: string } | null,
  verifyPasswordLogin: vi.fn(),
  createPortalCandidate: vi.fn(),
  setCandidatePassword: vi.fn(),
  regenerateRecoveryCodes: vi.fn(async () => ["AAAA-BBBB-CCCC-DDDD"]),
  establishPortalSession: vi.fn(async () => undefined),
  consumeOneTimeCode: vi.fn(),
  findActiveCandidateByEmail: vi.fn(),
  issueOneTimeCode: vi.fn(async () => ({ code: "x".repeat(32), expiresAt: new Date() })),
  hasCandidatePassword: vi.fn(async () => false),
  audit: vi.fn(async () => undefined),
  send: vi.fn(async () => undefined),
  createElement: vi.fn(),
  portalPasswordResetSubject: vi.fn(() => "localized-reset-subject"),
  sender: { send: vi.fn() } as { send: ReturnType<typeof vi.fn> } | null,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => m.session ? { value: "verified-session" } : undefined, set: vi.fn(), delete: vi.fn() }),
  headers: async () => new Headers({ "user-agent": "vitest" }),
}));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), createElement: m.createElement }));
vi.mock("@harly/db", () => ({ candidates: {}, db: {} }));
vi.mock("@harly/emails", () => ({
  PortalPasswordResetEmail: "PortalPasswordResetEmail",
  portalPasswordResetSubject: m.portalPasswordResetSubject,
}));
vi.mock("@/lib/portal-auth", () => ({
  PORTAL_SESSION_COOKIE: "harly_portal_session",
  getSinglePortalWorkspace: async () => ({ id: "ws1", slug: "acme" }),
  resolvePortalSession: vi.fn(async () => m.session),
  revokeOtherPortalSessions: vi.fn(),
}));
vi.mock("@/lib/portal-auth-methods", () => ({ getPortalAuthMethods: async () => m.methods }));
vi.mock("@/lib/portal-credentials", () => ({
  auditPortalEvent: m.audit,
  consumeOneTimeCode: m.consumeOneTimeCode,
  consumeRecoveryCode: vi.fn(),
  countRecoveryCodes: vi.fn(async () => 8),
  createPortalCandidate: m.createPortalCandidate,
  findActiveCandidateByEmail: m.findActiveCandidateByEmail,
  hasCandidatePassword: m.hasCandidatePassword,
  issueOneTimeCode: m.issueOneTimeCode,
  regenerateRecoveryCodes: m.regenerateRecoveryCodes,
  setCandidatePassword: m.setCandidatePassword,
  verifyCandidatePassword: vi.fn(),
  verifyPasswordLogin: m.verifyPasswordLogin,
}));
vi.mock("@/lib/portal-rate-limit", () => ({
  currentOriginHash: async () => "origin",
  passesPortalRateLimit: async () => m.rateOk,
}));
vi.mock("@/lib/portal-session", () => ({ establishPortalSession: m.establishPortalSession }));
vi.mock("@/lib/email", () => ({ getWorkspaceEmailSender: async () => m.sender }));
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }) }));
vi.mock("@/lib/public-origin", () => ({ getHarlyPublicOrigin: () => "http://localhost:3000" }));

import {
  loginPortalPasswordAction,
  redeemPortalAccessCodeAction,
  registerPortalPasswordAction,
  requestPortalPasswordResetEmailAction,
} from "./auth-actions";

beforeEach(() => {
  vi.clearAllMocks();
  m.rateOk = true;
  m.session = null;
  m.hasCandidatePassword.mockResolvedValue(false);
  m.methods = {
    password: true,
    accessCode: true,
    magicLink: false,
    passkey: false,
    oauth: { google: false, github: false, linkedin: false },
  };
  m.sender = { send: m.send };
});

describe("loginPortalPasswordAction", () => {
  it("gives the same answer for unknown email and wrong password", async () => {
    m.verifyPasswordLogin.mockResolvedValue(null);
    const a = await loginPortalPasswordAction({ email: "known@x.com", password: "wrong-pass-1" });
    const b = await loginPortalPasswordAction({ email: "ghost@x.com", password: "wrong-pass-1" });
    expect(a).toEqual(b);
    expect(a).toEqual({ ok: false, error: "Incorrect email or password." });
    expect(m.establishPortalSession).not.toHaveBeenCalled();
  });

  it("does not reveal whether password sign-in is off", async () => {
    m.methods.password = false;
    const r = await loginPortalPasswordAction({ email: "a@x.com", password: "whatever-1" });
    expect(r).toEqual({ ok: false, error: "Incorrect email or password." });
    expect(m.verifyPasswordLogin).not.toHaveBeenCalled();
  });

  it("stops before touching credentials when rate limited", async () => {
    m.rateOk = false;
    const r = await loginPortalPasswordAction({ email: "a@x.com", password: "whatever-1" });
    expect(r.ok).toBe(false);
    expect(m.verifyPasswordLogin).not.toHaveBeenCalled();
  });

  it("starts a rotated session, audits it and only follows /portal redirects", async () => {
    m.verifyPasswordLogin.mockResolvedValue({ candidateId: "c1" });
    const ok = await loginPortalPasswordAction({ email: "a@x.com", password: "good-pass-12", next: "https://evil.example" });
    expect(ok).toEqual({ ok: true, redirectTo: "/portal/dashboard" });
    expect(m.establishPortalSession).toHaveBeenCalledWith("c1", "ws1", "vitest");
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "portal.login", metadata: { method: "password" } }));
    const inside = await loginPortalPasswordAction({ email: "a@x.com", password: "good-pass-12", next: "/portal/jobs" });
    expect(inside).toEqual({ ok: true, redirectTo: "/portal/jobs" });
  });
});

describe("registerPortalPasswordAction", () => {
  const input = { email: "new@x.com", password: "a-decent-password", firstName: "Nia", lastName: "L" };

  it("sets a password only after identity proof, returns recovery codes and rotates the session", async () => {
    m.session = { candidateId: "c9", workspaceId: "ws1", email: input.email };
    const r = await registerPortalPasswordAction(input);
    expect(r).toMatchObject({ ok: true, recoveryCodes: ["AAAA-BBBB-CCCC-DDDD"] });
    expect(m.setCandidatePassword).toHaveBeenCalledWith("c9", "ws1", "a-decent-password");
    expect(m.establishPortalSession).toHaveBeenCalled();
  });

  it("never reserves an unverified email for access to future applications", async () => {
    m.createPortalCandidate.mockResolvedValue("c9");
    const r = await registerPortalPasswordAction(input);
    expect(r.ok).toBe(false);
    expect(m.setCandidatePassword).not.toHaveBeenCalled();
    expect(m.establishPortalSession).not.toHaveBeenCalled();
    expect(m.createPortalCandidate).not.toHaveBeenCalled();
  });

  it.each([
    { candidateId: "c9", workspaceId: "other", email: input.email },
    { candidateId: "c9", workspaceId: "ws1", email: "someone-else@x.com" },
  ])("rejects a session for another workspace or email", async (session) => {
    m.session = session;
    expect((await registerPortalPasswordAction(input)).ok).toBe(false);
    expect(m.setCandidatePassword).not.toHaveBeenCalled();
  });

  it("cannot replace an existing password without the current password", async () => {
    m.session = { candidateId: "c9", workspaceId: "ws1", email: input.email };
    m.hasCandidatePassword.mockResolvedValue(true);
    expect((await registerPortalPasswordAction(input)).ok).toBe(false);
    expect(m.setCandidatePassword).not.toHaveBeenCalled();
  });

  it("rejects weak passwords before creating anything", async () => {
    const r = await registerPortalPasswordAction({ ...input, password: "short" });
    expect(r.ok).toBe(false);
    expect(m.createPortalCandidate).not.toHaveBeenCalled();
  });

  it("is refused when password sign-in is not offered", async () => {
    m.methods.password = false;
    expect((await registerPortalPasswordAction(input)).ok).toBe(false);
    expect(m.createPortalCandidate).not.toHaveBeenCalled();
  });
});

describe("redeemPortalAccessCodeAction", () => {
  const code = "c".repeat(32);

  it("is refused when access codes are off", async () => {
    m.methods.accessCode = false;
    const r = await redeemPortalAccessCodeAction({ code });
    expect(r.ok).toBe(false);
    expect(m.consumeOneTimeCode).not.toHaveBeenCalled();
  });

  it("sends first-time candidates to set a password", async () => {
    m.consumeOneTimeCode.mockResolvedValue({ candidateId: "c1" });
    m.hasCandidatePassword.mockResolvedValue(false);
    expect(await redeemPortalAccessCodeAction({ code })).toEqual({ ok: true, redirectTo: "/portal/profile?setup=password" });
    m.hasCandidatePassword.mockResolvedValue(true);
    expect(await redeemPortalAccessCodeAction({ code })).toEqual({ ok: true, redirectTo: "/portal/dashboard" });
  });

  it("rejects used/expired codes with one generic message", async () => {
    m.consumeOneTimeCode.mockResolvedValue(null);
    const r = await redeemPortalAccessCodeAction({ code });
    expect(r).toEqual({ ok: false, error: "This access code is invalid, expired or already used." });
    expect(m.establishPortalSession).not.toHaveBeenCalled();
  });
});

describe("requestPortalPasswordResetEmailAction", () => {
  it("answers identically for known and unknown emails", async () => {
    m.findActiveCandidateByEmail.mockResolvedValueOnce({ id: "c1", email: "k@x.com", firstName: "K" });
    const known = await requestPortalPasswordResetEmailAction({ email: "k@x.com" });
    m.findActiveCandidateByEmail.mockResolvedValueOnce(null);
    const unknown = await requestPortalPasswordResetEmailAction({ email: "ghost@x.com" });
    expect(known).toEqual(unknown);
    expect(m.send).toHaveBeenCalledTimes(1);
  });

  it("uses the candidate's saved locale for the reset subject and template", async () => {
    m.findActiveCandidateByEmail.mockResolvedValueOnce({
      id: "c1",
      email: "k@x.com",
      firstName: "Casey",
      preferredEmailLocale: "nl-NL",
    });

    await requestPortalPasswordResetEmailAction({ email: "k@x.com" });

    expect(m.portalPasswordResetSubject).toHaveBeenCalledWith("nl-NL");
    expect(m.send).toHaveBeenCalledWith(expect.objectContaining({
      subject: "localized-reset-subject",
    }));
    expect(m.createElement).toHaveBeenCalledWith("PortalPasswordResetEmail", expect.objectContaining({
      candidateName: "Casey",
      locale: "nl-NL",
    }));
  });

  it("works without email by pointing to recovery codes", async () => {
    m.sender = null;
    const r = await requestPortalPasswordResetEmailAction({ email: "k@x.com" });
    expect(r.ok).toBe(false);
    expect(m.issueOneTimeCode).not.toHaveBeenCalled();
  });
});
