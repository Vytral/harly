import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queue: [] as Array<unknown[] | Error>,
  encryptionConfigured: true,
}));

function chain() {
  const next = () => {
    const value = mocks.queue.shift() ?? [];
    if (value instanceof Error) throw value;
    return value;
  };
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          try {
            return resolve(next());
          } catch (error) {
            return reject(error);
          }
        };
      }
      return () => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
}

vi.mock("server-only", () => ({}));
vi.mock("drizzle-orm", () => ({ and: () => ({}), eq: () => ({}) }));
vi.mock("@harly/db", () => ({
  db: { select: () => chain() },
  workspaceSettings: {},
  oauthProviders: {},
  ssoProvider: {},
}));
vi.mock("@/lib/crypto", () => ({ isEncryptionConfigured: () => mocks.encryptionConfigured }));
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ error: vi.fn() }) }));

import {
  getAvailableLoginMethods,
  getConfiguredLoginMethods,
  isStaffEmailDeliveryConfigured,
} from "./login-methods.server";

const SOCIAL_ENV = ["GOOGLE", "MICROSOFT", "GITHUB", "LINKEDIN"].flatMap((p) => [
  `${p}_CLIENT_ID`,
  `${p}_CLIENT_SECRET`,
]);

function settings(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: "org-1",
    enabledLoginMethods: [],
    emailEnabled: false,
    emailProvider: null,
    emailFrom: null,
    emailApiKeyCiphertext: null,
    emailSmtpHost: null,
    emailSmtpPort: null,
    ...overrides,
  };
}

describe("login methods discovery", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    mocks.queue.length = 0;
    mocks.encryptionConfigured = true;
    for (const key of [...SOCIAL_ENV, "RESEND_API_KEY"]) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("offers password and passkey only on a bare deployment", async () => {
    mocks.queue.push([settings()], [], []);
    await expect(getAvailableLoginMethods()).resolves.toEqual({
      password: true,
      passkey: true,
      magicLink: false,
      sso: false,
      social: [],
    });
  });

  it("enables magic link when a workspace SMTP sender is complete, and not when the port is missing", async () => {
    mocks.queue.push(
      [settings({ emailEnabled: true, emailProvider: "smtp", emailFrom: "hr@example.test", emailSmtpHost: "smtp.example.test", emailSmtpPort: 587 })],
      [],
      [],
    );
    expect((await getConfiguredLoginMethods()).magicLink).toBe(true);

    mocks.queue.push(
      [settings({ emailEnabled: true, emailProvider: "smtp", emailFrom: "hr@example.test", emailSmtpHost: "smtp.example.test" })],
      [],
      [],
    );
    expect((await getConfiguredLoginMethods()).magicLink).toBe(false);
  });

  it("requires a working encryption key for a stored Resend API key", async () => {
    const resend = settings({ emailEnabled: true, emailProvider: "resend", emailFrom: "hr@example.test", emailApiKeyCiphertext: "cipher" });
    mocks.encryptionConfigured = false;
    mocks.queue.push([resend], [], []);
    expect((await getConfiguredLoginMethods()).magicLink).toBe(false);
    mocks.encryptionConfigured = true;
    mocks.queue.push([resend], [], []);
    expect((await getConfiguredLoginMethods()).magicLink).toBe(true);
  });

  it("treats the platform RESEND_API_KEY as a working sender", async () => {
    process.env.RESEND_API_KEY = "re_test_placeholder";
    mocks.queue.push([settings()], [], []);
    await expect(isStaffEmailDeliveryConfigured()).resolves.toBe(true);
  });

  it("reports SSO when an enabled provider exists", async () => {
    mocks.queue.push([settings()], [{ id: "sso-1" }], []);
    expect((await getConfiguredLoginMethods()).sso).toBe(true);
  });

  it("counts a social provider only with a stored secret AND a usable encryption key, or with env vars", async () => {
    mocks.queue.push([settings()], [], [
      { provider: "google", enabled: true, hasSecret: "cipher" },
      { provider: "github", enabled: false, hasSecret: "cipher" },
      { provider: "microsoft", enabled: true, hasSecret: null },
    ]);
    expect((await getConfiguredLoginMethods()).social).toEqual(["google"]);

    mocks.encryptionConfigured = false;
    process.env.LINKEDIN_CLIENT_ID = "id";
    process.env.LINKEDIN_CLIENT_SECRET = "secret";
    mocks.queue.push([settings()], [], [
      { provider: "google", enabled: true, hasSecret: "cipher" },
    ]);
    expect((await getConfiguredLoginMethods()).social).toEqual(["linkedin"]);
  });

  it("applies the admin allow-list on top of what is configured", async () => {
    mocks.queue.push(
      [settings({ enabledLoginMethods: ["password"] })],
      [{ id: "sso-1" }],
      [],
    );
    const methods = await getAvailableLoginMethods();
    expect(methods.password).toBe(true);
    expect(methods.sso).toBe(false);
    expect(methods.passkey).toBe(false);
  });

  it("degrades to password-only when the database fails", async () => {
    mocks.queue.push(new Error("db down"));
    await expect(getAvailableLoginMethods()).resolves.toEqual({
      password: true,
      passkey: false,
      magicLink: false,
      sso: false,
      social: [],
    });
  });

  it("assumes email delivery works when the lookup fails", async () => {
    mocks.queue.push(new Error("db down"));
    await expect(isStaffEmailDeliveryConfigured()).resolves.toBe(true);
  });
});
