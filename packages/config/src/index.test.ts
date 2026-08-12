import { describe, expect, it, vi } from "vitest";

import { loadHarlyConfig } from "./index";

const production = {
  NODE_ENV: "production",
  HARLY_URL: "https://harly.example.com",
  DATABASE_URL: "postgresql://harly:secret@postgres:5432/harly",
  BETTER_AUTH_SECRET: "a".repeat(32),
  AI_ENCRYPTION_KEY: "b".repeat(32),
  STORAGE_UPLOAD_SECRET: "c".repeat(32),
  CRON_SECRET: "d".repeat(32),
  HARLY_SETUP_SECRET: "e".repeat(32),
  HARLY_INITIAL_ADMIN_EMAIL: "owner@example.com",
};

describe("loadHarlyConfig", () => {
  it("accepts a complete production configuration", () => {
    expect(loadHarlyConfig(production).HARLY_URL).toBe("https://harly.example.com");
  });

  it("rejects short independent secrets", () => {
    expect(() => loadHarlyConfig({ ...production, CRON_SECRET: "short" })).toThrow(
      /CRON_SECRET/,
    );
  });

  it("rejects an unspecified production public origin", () => {
    expect(() => loadHarlyConfig({ ...production, HARLY_URL: "https://0.0.0.0:3000" })).toThrow(
      /HARLY_URL/,
    );
  });

  it("rejects localhost in production", () => {
    expect(() => loadHarlyConfig({ ...production, HARLY_URL: "https://localhost:3000" })).toThrow(
      /HARLY_URL/,
    );
  });

  it("rejects the full IPv4 loopback range in production", () => {
    expect(() => loadHarlyConfig({ ...production, HARLY_URL: "https://127.0.0.2" })).toThrow(
      /HARLY_URL/,
    );
  });

  it("rejects localhost subdomains in production", () => {
    expect(() => loadHarlyConfig({ ...production, HARLY_URL: "https://tenant.localhost" })).toThrow(
      /HARLY_URL/,
    );
  });

  it("requires OAuth credentials in pairs", () => {
    expect(() => loadHarlyConfig({ ...production, GOOGLE_CLIENT_ID: "id" })).toThrow(
      /GOOGLE/,
    );
  });

  it("supports the deprecated URL fallback with one warning", () => {
    const warn = vi.fn();
    const config = loadHarlyConfig(
      { ...production, HARLY_URL: undefined, NEXT_PUBLIC_APP_URL: "https://legacy.example.com" },
      { warn },
    );
    expect(config.HARLY_URL).toBe("https://legacy.example.com");
    expect(warn).toHaveBeenCalledOnce();
  });
});
