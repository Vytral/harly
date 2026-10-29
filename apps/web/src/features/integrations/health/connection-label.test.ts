import { describe, expect, it } from "vitest";

import { buildIntegrationHealthView, type IntegrationHealthView } from "./model";
import { providerStatusLabel, providerStatusTone } from "./connection-label";

function viewFor(state: "connected" | "degraded" | "needs_reconnect" | "error" | "not_connected"): IntegrationHealthView {
  return buildIntegrationHealthView("telegram", state !== "not_connected", state === "not_connected" || state === "connected"
    ? null
    : { state, lastOkAt: null, lastErrorAt: null, lastError: null, consecutiveFailures: 1 });
}

describe("providerStatusLabel", () => {
  it("keeps the configured label while the integration is healthy", () => {
    expect(providerStatusLabel(viewFor("connected"), "Connected")).toBe("Connected");
    expect(providerStatusLabel(viewFor("connected"), "Disabled")).toBe("Disabled");
  });

  it("says reconnect required, never Connected, after a credential failure", () => {
    expect(providerStatusLabel(viewFor("needs_reconnect"), "Connected")).toBe("Reconnect required");
  });

  it("says needs attention for degraded and error states", () => {
    expect(providerStatusLabel(viewFor("degraded"), "Connected")).toBe("Needs attention");
    expect(providerStatusLabel(viewFor("error"), "Connected")).toBe("Needs attention");
  });

  it("falls back to the configured label when no health view is available", () => {
    expect(providerStatusLabel(undefined, "Not connected")).toBe("Not connected");
    expect(providerStatusLabel(null, "Connected")).toBe("Connected");
  });

  it("reads not connected for an unconfigured integration", () => {
    expect(providerStatusLabel(viewFor("not_connected"), "Connected")).toBe("Not connected");
  });
});

describe("providerStatusTone", () => {
  it("keeps the configured tone while healthy and warns about attention states", () => {
    expect(providerStatusTone(viewFor("connected"), "on")).toBe("on");
    expect(providerStatusTone(viewFor("needs_reconnect"), "on")).toBe("warn");
    expect(providerStatusTone(viewFor("degraded"), "on")).toBe("warn");
    expect(providerStatusTone(viewFor("error"), "on")).toBe("warn");
    expect(providerStatusTone(undefined, "neutral")).toBe("neutral");
  });
});
