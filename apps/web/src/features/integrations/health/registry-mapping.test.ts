import { describe, expect, it } from "vitest";

import {
  buildHealthByKey,
  integrationHealthKeyForSlug,
  withSlackDeliveryHealth,
} from "./registry-mapping";
import { INTEGRATION_HEALTH_KEYS, type IntegrationHealthKey } from "./model";

const allConfigured = Object.fromEntries(
  INTEGRATION_HEALTH_KEYS.map((key) => [key, true]),
) as Record<IntegrationHealthKey, boolean>;

describe("integration registry mapping", () => {
  it("maps provider slugs onto shared health keys", () => {
    expect(integrationHealthKeyForSlug("google-calendar")).toBe("gcal");
    expect(integrationHealthKeyForSlug("google-meet")).toBe("gcal");
    expect(integrationHealthKeyForSlug("microsoft-teams")).toBe("outlook");
    expect(integrationHealthKeyForSlug("outlook-calendar")).toBe("outlook");
    expect(integrationHealthKeyForSlug("zoom")).toBe("zoom");
    expect(integrationHealthKeyForSlug("turnstile")).toBeNull();
    expect(integrationHealthKeyForSlug("harly-sign")).toBeNull();
  });

  it("builds a view for every health-tracked provider", () => {
    const health = buildHealthByKey(allConfigured, {});
    expect(Object.keys(health).sort()).toEqual([...INTEGRATION_HEALTH_KEYS].sort());
    expect(health.zoom).toMatchObject({ state: "connected", connected: true });
  });

  it("maps a Slack dead-token delivery failure to needs_reconnect", () => {
    const stored = withSlackDeliveryHealth({}, {
      status: "failed",
      error: "An API error occurred: token_revoked",
      createdAt: "2030-01-02T00:00:00.000Z",
    });
    const health = buildHealthByKey(allConfigured, stored);
    expect(health.slack).toMatchObject({
      state: "needs_reconnect",
      reconnectRequired: true,
      connected: false,
      lastErrorAt: "2030-01-02T00:00:00.000Z",
    });
  });

  it("ignores a Slack delivery failure older than the last successful call", () => {
    const stored = {
      slack: {
        state: "connected" as const,
        lastOkAt: new Date("2030-01-03T00:00:00.000Z"),
        lastErrorAt: null,
        lastError: null,
        consecutiveFailures: 0,
      },
    };
    const result = withSlackDeliveryHealth(stored, {
      status: "failed",
      error: "invalid_auth",
      createdAt: "2030-01-02T00:00:00.000Z",
    });
    expect(result).toBe(stored);
  });

  it("ignores transient or successful Slack deliveries", () => {
    expect(
      withSlackDeliveryHealth({}, { status: "failed", error: "ETIMEDOUT", createdAt: "2030-01-02T00:00:00.000Z" }),
    ).toEqual({});
    expect(
      withSlackDeliveryHealth({}, { status: "success", error: null, createdAt: "2030-01-02T00:00:00.000Z" }),
    ).toEqual({});
    expect(withSlackDeliveryHealth({}, null)).toEqual({});
  });

  it("reports an unconfigured integration as not connected unless it needs reconnect", () => {
    const health = buildHealthByKey(
      { ...allConfigured, gcal: false },
      {},
    );
    expect(health.gcal).toMatchObject({ state: "not_connected", connected: false });
  });
});
