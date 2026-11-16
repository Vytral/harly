import { randomBytes } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  demoSandboxSettings,
  loadHarlyConfig,
  secretHasEnoughEntropy,
} from "./index";
import {
  isEmailLocale,
  normalizeEmailLocale,
  resolveEmailLocale,
  supportedEmailLocales,
} from "./email-locale";

describe("email locale", () => {
  it("normalizes case and whitespace to a supported canonical locale", () => {
    expect(normalizeEmailLocale(" PT-br ")).toBe("pt-BR");
    expect(normalizeEmailLocale("NL-nl")).toBe("nl-NL");
  });

  it("rejects unsupported and non-string values without guessing", () => {
    expect(normalizeEmailLocale("pt-PT")).toBeNull();
    expect(normalizeEmailLocale("es-MX")).toBeNull();
    expect(normalizeEmailLocale(null)).toBeNull();
    expect(normalizeEmailLocale({})).toBeNull();
  });

  it("resolves missing or invalid preferences to English and validates canonical tags", () => {
    expect(resolveEmailLocale(undefined)).toBe("en");
    expect(resolveEmailLocale("pt-PT")).toBe("en");
    expect(supportedEmailLocales).toEqual([
      "en",
      "es",
      "pt-BR",
      "de",
      "fr",
      "nl-NL",
    ]);
    expect(isEmailLocale("pt-BR")).toBe(true);
    expect(isEmailLocale("PT-br")).toBe(false);
  });
});

const production = {
  NODE_ENV: "production",
  HARLY_URL: "https://harly.example.com",
  DATABASE_URL: "postgresql://harly:secret@postgres:5432/harly",
  BETTER_AUTH_SECRET: "ci-only-auth-secret-7Qx2mV9pLk4Rt8Wz",
  AI_ENCRYPTION_KEY: "ci-only-ai-key-Hn3Zc6Yd1Fs5Jb0Xu8Pa",
  STORAGE_UPLOAD_SECRET: "ci-only-upload-Tg4Ke7Ow2Mi9Rv5Cn1Ly",
  CRON_SECRET: "ci-only-cron-secret-Bp6Qa3Xe8Uz1Wk4Dj7",
  HARLY_SETUP_SECRET: "ci-only-setup-secret-Nf5Hs2Vy9Gt0Lm6Ro3",
  HARLY_INITIAL_ADMIN_EMAIL: "owner@example.com",
};

describe("loadHarlyConfig", () => {
  it("accepts a complete production configuration", () => {
    expect(loadHarlyConfig(production).HARLY_URL).toBe(
      "https://harly.example.com",
    );
  });

  it("rejects short independent secrets", () => {
    expect(() =>
      loadHarlyConfig({ ...production, CRON_SECRET: "short" }),
    ).toThrow(/CRON_SECRET/);
  });

  it("rejects long but low-entropy secrets", () => {
    for (const weak of ["a".repeat(64), "ab".repeat(32), "abcd".repeat(16)]) {
      expect(() =>
        loadHarlyConfig({ ...production, CRON_SECRET: weak }),
      ).toThrow(/CRON_SECRET/);
    }
  });

  it("accepts openssl and CLI style generated secrets", () => {
    const generated = [
      randomBytes(32).toString("base64"),
      randomBytes(32).toString("hex"),
      randomBytes(32).toString("base64url"),
    ];
    for (const value of generated) {
      expect(secretHasEnoughEntropy(value)).toBe(true);
      expect(() =>
        loadHarlyConfig({ ...production, CRON_SECRET: value }),
      ).not.toThrow();
    }
  });

  it("rejects an unspecified production public origin", () => {
    expect(() =>
      loadHarlyConfig({ ...production, HARLY_URL: "https://0.0.0.0:3000" }),
    ).toThrow(/HARLY_URL/);
  });

  it("rejects localhost in production", () => {
    expect(() =>
      loadHarlyConfig({ ...production, HARLY_URL: "https://localhost:3000" }),
    ).toThrow(/HARLY_URL/);
  });

  it("allows only an explicit HTTP loopback origin for production E2E", () => {
    expect(
      loadHarlyConfig({
        ...production,
        HARLY_URL: "http://127.0.0.1:3000",
        HARLY_E2E: "true",
      }).HARLY_URL,
    ).toBe("http://127.0.0.1:3000");
    expect(() =>
      loadHarlyConfig({
        ...production,
        HARLY_URL: "http://127.0.0.2:3000",
        HARLY_E2E: "true",
      }),
    ).toThrow(/HARLY_URL/);
  });

  it("rejects the full IPv4 loopback range in production", () => {
    expect(() =>
      loadHarlyConfig({ ...production, HARLY_URL: "https://127.0.0.2" }),
    ).toThrow(/HARLY_URL/);
  });

  it("rejects localhost subdomains in production", () => {
    expect(() =>
      loadHarlyConfig({ ...production, HARLY_URL: "https://tenant.localhost" }),
    ).toThrow(/HARLY_URL/);
  });

  it("requires OAuth credentials in pairs", () => {
    expect(() =>
      loadHarlyConfig({ ...production, GOOGLE_CLIENT_ID: "id" }),
    ).toThrow(/GOOGLE/);
  });

  it("supports the deprecated URL fallback with one warning", () => {
    const warn = vi.fn();
    const config = loadHarlyConfig(
      {
        ...production,
        HARLY_URL: undefined,
        NEXT_PUBLIC_APP_URL: "https://legacy.example.com",
      },
      { warn },
    );
    expect(config.HARLY_URL).toBe("https://legacy.example.com");
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe("demoSandboxSettings", () => {
  it("defaults to a four hour lifetime and forty sandboxes", () => {
    expect(demoSandboxSettings({})).toEqual({ ttlMinutes: 240, maxActive: 40 });
  });

  it("reads valid overrides and ignores out-of-range values", () => {
    expect(
      demoSandboxSettings({
        DEMO_SANDBOX_TTL_MINUTES: "60",
        DEMO_SANDBOX_MAX_ACTIVE: "10",
      }),
    ).toEqual({ ttlMinutes: 60, maxActive: 10 });
    expect(
      demoSandboxSettings({
        DEMO_SANDBOX_TTL_MINUTES: "1",
        DEMO_SANDBOX_MAX_ACTIVE: "abc",
      }),
    ).toEqual({ ttlMinutes: 240, maxActive: 40 });
  });
});
