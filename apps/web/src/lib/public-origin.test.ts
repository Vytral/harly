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
});
