import { describe, expect, it } from "vitest";

import type { IntegrationHealthView } from "./model";
import {
  buildIntegrationHealthResponse,
  coarseIntegrationHealth,
  stripSecrets,
} from "./response";

const health = (over: Partial<IntegrationHealthView> = {}): IntegrationHealthView => ({
  integration: "docuseal",
  state: "needs_reconnect",
  configured: true,
  connected: false,
  reconnectRequired: true,
  needsAttention: true,
  lastOkAt: "2026-10-01T00:00:00.000Z",
  lastErrorAt: "2026-10-02T00:00:00.000Z",
  lastError: "DocuSeal rejected the request for jane@example.com",
  consecutiveFailures: 3,
  ...over,
});

const statuses = {
  docuseal: {
    enabled: true,
    hasToken: true,
    hasWebhookSecret: true,
    webhookSecret: "whsec_super_secret_value",
    url: "https://sign.example.com",
  },
  gcal: { enabled: true, accountEmail: "recruiter@example.com" },
  nested: { list: [{ refreshToken: "r-123", ok: true }] },
};

describe("integration health API response", () => {
  it("never returns secrets, even to managers", () => {
    const body = buildIntegrationHealthResponse({
      canManage: true,
      statuses,
      integrations: [health()],
    });
    const text = JSON.stringify(body);
    expect(text).not.toContain("whsec_super_secret_value");
    expect(text).not.toContain("r-123");
    const managed = body as unknown as {
      statuses: { docuseal: { hasWebhookSecret: boolean; url: string } };
    };
    expect(managed.statuses.docuseal.hasWebhookSecret).toBe(true);
    expect(managed.statuses.docuseal.url).toBe("https://sign.example.com");
  });

  it("gives members without integrations:manage only coarse states", () => {
    const body = buildIntegrationHealthResponse({
      canManage: false,
      statuses,
      integrations: [health()],
    });
    expect(Object.keys(body)).toEqual(["integrations"]);
    const text = JSON.stringify(body);
    expect(text).not.toContain("jane@example.com");
    expect(text).not.toContain("recruiter@example.com");
    expect(text).not.toContain("whsec_super_secret_value");
    expect(text).not.toContain("lastError");
    expect(body.integrations).toEqual([
      {
        integration: "docuseal",
        state: "needs_reconnect",
        connected: false,
        reconnectRequired: true,
        needsAttention: true,
        lastOkAt: "2026-10-01T00:00:00.000Z",
      },
    ]);
  });

  it("strips secret keys at any depth and leaves other values alone", () => {
    expect(stripSecrets({ a: 1, webhookSecret: "x", b: [{ apiToken: "y", c: "keep" }] })).toEqual({
      a: 1,
      b: [{ c: "keep" }],
    });
    expect(coarseIntegrationHealth([])).toEqual([]);
  });
});
