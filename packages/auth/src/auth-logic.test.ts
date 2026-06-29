import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildSocialProviders,
  enforceInviteOnly,
  sendAuthEmail,
  sendMagicLinkEmail,
  type AuthDb,
  type EmailSender,
} from "./auth-logic";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(
  orgExists: boolean,
  pendingInvite: boolean,
): AuthDb {
  return {
    organizationExists: vi.fn().mockResolvedValue(orgExists),
    hasPendingInvitation: vi.fn().mockResolvedValue(pendingInvite),
  };
}

function makeUser(email = "ada@example.com") {
  return { id: "user_1", email, name: "Ada Lovelace" };
}

// ─────────────────────────────────────────────────────────────────────────────
// buildSocialProviders
// ─────────────────────────────────────────────────────────────────────────────

describe("buildSocialProviders", () => {
  it("returns an empty object when no env vars are set", () => {
    expect(buildSocialProviders({})).toEqual({});
  });

  it("includes google when both GOOGLE_* vars are set", () => {
    const providers = buildSocialProviders({
      GOOGLE_CLIENT_ID: "g-id",
      GOOGLE_CLIENT_SECRET: "g-secret",
    });
    expect(providers.google).toEqual({
      clientId: "g-id",
      clientSecret: "g-secret",
    });
    expect(providers.microsoft).toBeUndefined();
    expect(providers.github).toBeUndefined();
  });

  it("includes microsoft with tenantId=common when both MICROSOFT_* vars are set", () => {
    const providers = buildSocialProviders({
      MICROSOFT_CLIENT_ID: "ms-id",
      MICROSOFT_CLIENT_SECRET: "ms-secret",
    });
    expect(providers.microsoft).toEqual({
      clientId: "ms-id",
      clientSecret: "ms-secret",
      tenantId: "common",
    });
  });

  it("includes github when both GITHUB_* vars are set", () => {
    const providers = buildSocialProviders({
      GITHUB_CLIENT_ID: "gh-id",
      GITHUB_CLIENT_SECRET: "gh-secret",
    });
    expect(providers.github).toEqual({
      clientId: "gh-id",
      clientSecret: "gh-secret",
    });
  });

  it("includes all three providers when all vars are set", () => {
    const providers = buildSocialProviders({
      GOOGLE_CLIENT_ID: "g-id",
      GOOGLE_CLIENT_SECRET: "g-secret",
      MICROSOFT_CLIENT_ID: "ms-id",
      MICROSOFT_CLIENT_SECRET: "ms-secret",
      GITHUB_CLIENT_ID: "gh-id",
      GITHUB_CLIENT_SECRET: "gh-secret",
    });
    expect(Object.keys(providers).sort()).toEqual(["github", "google", "microsoft"]);
  });

  it("includes linkedin when both LINKEDIN_* vars are set", () => {
    const providers = buildSocialProviders({
      LINKEDIN_CLIENT_ID: "li-id",
      LINKEDIN_CLIENT_SECRET: "li-secret",
    });
    expect(providers.linkedin).toEqual({
      clientId: "li-id",
      clientSecret: "li-secret",
    });
  });

  it("includes all four providers when all vars are set", () => {
    const providers = buildSocialProviders({
      GOOGLE_CLIENT_ID: "g-id",
      GOOGLE_CLIENT_SECRET: "g-secret",
      MICROSOFT_CLIENT_ID: "ms-id",
      MICROSOFT_CLIENT_SECRET: "ms-secret",
      GITHUB_CLIENT_ID: "gh-id",
      GITHUB_CLIENT_SECRET: "gh-secret",
      LINKEDIN_CLIENT_ID: "li-id",
      LINKEDIN_CLIENT_SECRET: "li-secret",
    });
    expect(Object.keys(providers).sort()).toEqual(["github", "google", "linkedin", "microsoft"]);
  });

  it("omits a provider when only the clientId is present (no secret)", () => {
    const providers = buildSocialProviders({ GOOGLE_CLIENT_ID: "g-id" });
    expect(providers.google).toBeUndefined();
  });

  it("omits a provider when only the clientSecret is present (no id)", () => {
    const providers = buildSocialProviders({ GOOGLE_CLIENT_SECRET: "g-secret" });
    expect(providers.google).toBeUndefined();
  });

  it("omits a provider when its vars are empty strings", () => {
    const providers = buildSocialProviders({
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "g-secret",
    });
    expect(providers.google).toBeUndefined();
  });

  it("reads from process.env by default", () => {
    const prev = {
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    };
    process.env.GOOGLE_CLIENT_ID = "env-id";
    process.env.GOOGLE_CLIENT_SECRET = "env-secret";

    const providers = buildSocialProviders();
    expect(providers.google?.clientId).toBe("env-id");

    process.env.GOOGLE_CLIENT_ID = prev.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = prev.GOOGLE_CLIENT_SECRET;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sendAuthEmail
// ─────────────────────────────────────────────────────────────────────────────

describe("sendAuthEmail", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls sender.send with the correct to and subject", async () => {
    const sender: EmailSender = { send: vi.fn().mockResolvedValue(undefined) };
    await sendAuthEmail({
      to: "ada@example.com",
      subject: "Welcome to Harly",
      fallbackLog: "fallback",
      sender,
    });
    expect(sender.send).toHaveBeenCalledWith({
      to: "ada@example.com",
      subject: "Welcome to Harly",
    });
  });

  it("logs fallbackLog when sender is null (no email configured)", async () => {
    await sendAuthEmail({
      to: "ada@example.com",
      subject: "Verify your email",
      fallbackLog: "Verification URL: https://example.com/verify",
      sender: null,
    });
    expect(console.log).toHaveBeenCalledWith(
      "Verification URL: https://example.com/verify",
    );
  });

  it("logs fallbackLog when sender.send throws", async () => {
    const sender: EmailSender = {
      send: vi.fn().mockRejectedValue(new Error("SMTP failure")),
    };
    await sendAuthEmail({
      to: "ada@example.com",
      subject: "Reset password",
      fallbackLog: "Reset URL: https://example.com/reset",
      sender,
    });
    expect(console.error).toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      "Reset URL: https://example.com/reset",
    );
  });

  it("does not throw even when the sender throws", async () => {
    const sender: EmailSender = {
      send: vi.fn().mockRejectedValue(new Error("Network error")),
    };
    await expect(
      sendAuthEmail({
        to: "ada@example.com",
        subject: "Test",
        fallbackLog: "fallback",
        sender,
      }),
    ).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sendMagicLinkEmail
// ─────────────────────────────────────────────────────────────────────────────

describe("sendMagicLinkEmail", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs the magic link when no API key is configured", async () => {
    await sendMagicLinkEmail({
      email: "ada@example.com",
      url: "https://example.com/magic-link",
      apiKey: undefined,
    });
    expect(console.log).toHaveBeenCalledWith(
      "Magic link for ada@example.com: https://example.com/magic-link",
    );
  });

  it("calls sendFn with correct args when API key is present", async () => {
    const sendFn = vi.fn().mockResolvedValue(undefined);
    await sendMagicLinkEmail({
      email: "ada@example.com",
      url: "https://example.com/magic",
      apiKey: "re_test_123",
      sendFn,
    });
    expect(sendFn).toHaveBeenCalledOnce();
    const call = sendFn.mock.calls[0][0] as {
      from: string;
      to: string;
      subject: string;
      text: string;
    };
    expect(call.to).toBe("ada@example.com");
    expect(call.subject).toBe("Sign in to Harly");
    expect(call.text).toContain("https://example.com/magic");
  });

  it("uses the default from address when none is provided", async () => {
    const sendFn = vi.fn().mockResolvedValue(undefined);
    await sendMagicLinkEmail({
      email: "ada@example.com",
      url: "https://example.com/magic",
      apiKey: "re_test_123",
      sendFn,
    });
    const call = sendFn.mock.calls[0][0] as { from: string };
    expect(call.from).toBe("Harly <noreply@harly.dev>");
  });

  it("uses a custom from address when provided", async () => {
    const sendFn = vi.fn().mockResolvedValue(undefined);
    await sendMagicLinkEmail({
      email: "ada@example.com",
      url: "https://example.com/magic",
      apiKey: "re_test_123",
      from: "Acme <hi@acme.io>",
      sendFn,
    });
    const call = sendFn.mock.calls[0][0] as { from: string };
    expect(call.from).toBe("Acme <hi@acme.io>");
  });

  it("logs the fallback and does NOT throw when sendFn throws", async () => {
    const sendFn = vi.fn().mockRejectedValue(new Error("Rate limited"));
    await expect(
      sendMagicLinkEmail({
        email: "ada@example.com",
        url: "https://example.com/magic",
        apiKey: "re_test_123",
        sendFn,
      }),
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      "Magic link for ada@example.com: https://example.com/magic",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// enforceInviteOnly — the core signup gate
// ─────────────────────────────────────────────────────────────────────────────

describe("enforceInviteOnly", () => {
  // ── bootstrap path ─────────────────────────────────────────────────────────

  it("allows the very first user through (no org exists)", async () => {
    const db = makeDb(false, false);
    const user = makeUser();
    const result = await enforceInviteOnly(user, db);
    expect(result).toEqual({ data: user });
  });

  it("does not check for invitation when no org exists", async () => {
    const db = makeDb(false, false);
    await enforceInviteOnly(makeUser(), db);
    expect(db.hasPendingInvitation).not.toHaveBeenCalled();
  });

  // ── invited user path ───────────────────────────────────────────────────────

  it("allows a user with a valid pending invitation", async () => {
    const db = makeDb(true, true);
    const user = makeUser("invited@example.com");
    const result = await enforceInviteOnly(user, db);
    expect(result).toEqual({ data: user });
  });

  it("passes the user's email to hasPendingInvitation", async () => {
    const db = makeDb(true, true);
    await enforceInviteOnly(makeUser("invited@example.com"), db);
    expect(db.hasPendingInvitation).toHaveBeenCalledWith("invited@example.com");
  });

  // ── rejection path ──────────────────────────────────────────────────────────

  it("throws APIError when org exists and no invitation is found", async () => {
    const db = makeDb(true, false);
    await expect(enforceInviteOnly(makeUser(), db)).rejects.toThrow(
      "Signups are invite-only",
    );
  });

  it("throws with status BAD_REQUEST", async () => {
    const db = makeDb(true, false);
    try {
      await enforceInviteOnly(makeUser(), db);
      expect.fail("Should have thrown");
    } catch (error: unknown) {
      // APIError shape from better-auth
      expect((error as { status: string }).status).toBe("BAD_REQUEST");
    }
  });

  it("preserves all fields on the returned user object", async () => {
    const db = makeDb(false, false);
    const user = {
      id: "u_1",
      email: "ada@example.com",
      name: "Ada Lovelace",
      image: null,
      extraField: "custom",
    };
    const result = await enforceInviteOnly(user, db);
    expect(result.data).toEqual(user);
  });

  it("checks organizationExists exactly once per call", async () => {
    const db = makeDb(false, false);
    await enforceInviteOnly(makeUser(), db);
    expect(db.organizationExists).toHaveBeenCalledOnce();
  });

  it("checks hasPendingInvitation exactly once when org exists", async () => {
    const db = makeDb(true, false);
    await expect(enforceInviteOnly(makeUser(), db)).rejects.toThrow();
    expect(db.hasPendingInvitation).toHaveBeenCalledOnce();
  });

  // ── email normalisation ─────────────────────────────────────────────────────

  it("passes the raw email to hasPendingInvitation (DB owns normalisation)", async () => {
    const db = makeDb(true, true);
    const email = "Ada@Example.COM";
    await enforceInviteOnly(makeUser(email), db);
    expect(db.hasPendingInvitation).toHaveBeenCalledWith(email);
  });

  // ── DB failure resilience ───────────────────────────────────────────────────

  it("propagates a DB error from organizationExists", async () => {
    const db: AuthDb = {
      organizationExists: vi.fn().mockRejectedValue(new Error("DB down")),
      hasPendingInvitation: vi.fn(),
    };
    await expect(enforceInviteOnly(makeUser(), db)).rejects.toThrow("DB down");
  });

  it("propagates a DB error from hasPendingInvitation", async () => {
    const db: AuthDb = {
      organizationExists: vi.fn().mockResolvedValue(true),
      hasPendingInvitation: vi.fn().mockRejectedValue(new Error("Timeout")),
    };
    await expect(enforceInviteOnly(makeUser(), db)).rejects.toThrow("Timeout");
  });
});
