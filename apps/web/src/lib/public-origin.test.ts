import { describe, expect, it, vi } from "vitest";

import { getEsignWebhookBaseUrl, getHarlyPublicOrigin } from "./public-origin";

describe("public provider origin", () => {
  it("uses HARLY_URL and returns the origin only", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("HARLY_URL", "https://harly.example.com/ignored-path");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://legacy.example.com");

    expect(getHarlyPublicOrigin()).toBe("https://harly.example.com");
    expect(getEsignWebhookBaseUrl()).toBe(
      "https://harly.example.com/api/integrations/docuseal/webhook",
    );
  });

  it("rejects insecure production origins", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("HARLY_URL", "http://harly.example.com");

    expect(() => getHarlyPublicOrigin()).toThrow(/HTTPS/);
  });

  it("rejects an unspecified production bind address", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("HARLY_URL", "https://0.0.0.0:3000");

    expect(() => getHarlyPublicOrigin()).toThrow(/reachable public hostname/);
  });

  it("rejects localhost in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("HARLY_URL", "https://localhost:3000");

    expect(() => getHarlyPublicOrigin()).toThrow(/reachable public hostname/);
  });

  it("uses a non-routable placeholder only during the production build", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.stubEnv("HARLY_URL", "http://localhost:3000");

    expect(getHarlyPublicOrigin()).toBe("https://build.invalid");
  });
});
