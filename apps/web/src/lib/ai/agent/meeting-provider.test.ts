import { describe, expect, it } from "vitest";

import { buildIntegrationHealthView, type IntegrationHealthKey, type StoredHealthRow } from "@/features/integrations/health/model";

import {
  chooseMeetingProvider,
  providerIsReady,
  type MeetingProviderStatuses,
} from "./meeting-provider";

const stored = (state: StoredHealthRow["state"]): StoredHealthRow => ({
  state,
  lastOkAt: null,
  lastErrorAt: null,
  lastError: null,
  consecutiveFailures: state === "connected" ? 0 : 1,
});

/** Statuses where every provider is configured and ready, unless a health row says otherwise. */
function statuses(
  stored: Partial<Record<IntegrationHealthKey, StoredHealthRow>> = {},
  overrides: Partial<{ zoom: boolean; outlook: boolean; gcal: boolean; jitsi: boolean }> = {},
): MeetingProviderStatuses {
  const health = {} as MeetingProviderStatuses["health"];
  const configured = {
    zoom: overrides.zoom ?? true,
    outlook: overrides.outlook ?? true,
    gcal: overrides.gcal ?? true,
    jitsi: overrides.jitsi ?? true,
  };
  health.zoom = buildIntegrationHealthView("zoom", configured.zoom, stored.zoom ?? null);
  health.outlook = buildIntegrationHealthView("outlook", configured.outlook, stored.outlook ?? null);
  health.gcal = buildIntegrationHealthView("gcal", configured.gcal, stored.gcal ?? null);
  health.jitsi = buildIntegrationHealthView("jitsi", configured.jitsi, stored.jitsi ?? null);
  return {
    zoom: { installationState: "installed", configured: true },
    outlook: { enabled: true, hasToken: true, encryptionReady: true },
    gcal: { enabled: true, hasRefreshToken: true, hasCredentials: true, encryptionReady: true },
    jitsi: { enabled: true, baseUrl: "https://meet.example.test" },
    health,
  } as unknown as MeetingProviderStatuses;
}

describe("chooseMeetingProvider", () => {
  it("picks Zoom first when it is installed, configured and healthy", () => {
    expect(chooseMeetingProvider("auto", statuses(), false)).toBe("zoom");
  });

  it("skips Zoom that needs reconnecting, even though its token is still stored", () => {
    expect(chooseMeetingProvider("auto", statuses({ zoom: stored("needs_reconnect") }), false)).toBe("teams");
  });

  it("skips Google Calendar in an error state (credentials cannot be decrypted)", () => {
    const current = statuses({
      zoom: stored("needs_reconnect"),
      outlook: stored("needs_reconnect"),
      gcal: stored("error"),
    });
    expect(chooseMeetingProvider("auto", current, false)).toBe("jitsi");
  });

  it("does not pick a provider that is not configured", () => {
    expect(chooseMeetingProvider("auto", statuses({}, { zoom: false, outlook: false, gcal: false, jitsi: false }), false)).toBe("none");
  });

  it("returns an explicit request unchanged, so readiness can report it", () => {
    expect(chooseMeetingProvider("zoom", statuses({ zoom: stored("needs_reconnect") }), false)).toBe("zoom");
  });
});

describe("providerIsReady", () => {
  it("is false for Zoom in reconnect state, even when configured", () => {
    expect(providerIsReady("zoom", statuses({ zoom: stored("needs_reconnect") }), false)).toBe(false);
  });

  it("is true for a degraded provider, which still works", () => {
    expect(providerIsReady("google_meet", statuses({ gcal: stored("degraded") }), false)).toBe(true);
  });

  it("is false for Google Meet with stored credentials that cannot be decrypted", () => {
    expect(providerIsReady("google_meet", statuses({ gcal: stored("error") }), false)).toBe(false);
  });

  it("external needs an explicit location", () => {
    expect(providerIsReady("external", statuses(), false)).toBe(false);
    expect(providerIsReady("external", statuses(), true)).toBe(true);
  });

  it("is false for none", () => {
    expect(providerIsReady("none", statuses(), true)).toBe(false);
  });
});
