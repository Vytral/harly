import { describe, expect, it } from "vitest";

import {
  DEGRADED_FAILURE_THRESHOLD,
  FAILURE_WINDOW_MS,
  MAX_LAST_ERROR_LENGTH,
  buildIntegrationHealthView,
  classifyIntegrationError,
  deriveIntegrationState,
  healthRowFromDeliveryFailure,
  nextHealthAfterFailure,
  nextHealthAfterSuccess,
  sanitizeIntegrationError,
  type HealthSnapshot,
  type StoredHealthRow,
} from "./model";

function apiError(message: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(message), extra);
}

describe("classifyIntegrationError", () => {
  it.each([
    ["invalid_grant from Google token refresh", "gcal", new Error("invalid_grant: Token has been expired or revoked."), "auth"],
    ["Microsoft refresh rejection", "outlook", new Error("Token refresh failed: invalid_grant , AADSTS70008"), "auth"],
    ["provider 401 status", "zoom", apiError("Zoom API error: 401", { status: 401 }), "auth"],
    ["401 in a Graph error message", "outlook", new Error("Microsoft Graph API 401: unauthorized"), "auth"],
    ["403 permission failure", "gcal", new Error("Google Calendar API 403: insufficientPermissions"), "auth"],
    ["Slack revoked token code", "slack", apiError("An API error occurred: token_revoked", { data: { error: "token_revoked" } }), "auth"],
    ["Slack invalid_auth code", "slack", apiError("An API error occurred: invalid_auth", { data: { error: "invalid_auth" } }), "auth"],
    ["Google gaxios error response code", "gcal", apiError("request failed", { response: { status: 400, data: { error: "invalid_grant" } } }), "auth"],
    ["timeout code", "zoom", apiError("connect ETIMEDOUT 52.1.2.3:443", { code: "ETIMEDOUT" }), "transient"],
    ["abort timeout", "telegram", Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }), "transient"],
    ["503 from provider", "outlook", new Error("Microsoft Graph API 503: service unavailable"), "transient"],
    ["429 rate limit", "zoom", apiError("Zoom API error: 429", { status: 429 }), "transient"],
    ["Google quota error answered with 403", "gcal", new Error("Google Calendar API 403: userRateLimitExceeded"), "transient"],
    ["408 request timeout", "docuseal", new Error("DocuSeal API 408: slow"), "transient"],
    ["Slack ratelimited code", "slack", apiError("An API error occurred: ratelimited", { data: { error: "ratelimited" } }), "transient"],
    ["validation error is other", "zoom", apiError("Zoom API error: 400", { status: 400, message: "Invalid topic" }), "other"],
    ["unknown error is other", "jitsi", new Error("Something odd happened"), "other"],
  ])("%s", (_label, key, error, kind) => {
    expect(classifyIntegrationError(key as never, error).kind).toBe(kind);
  });

  it("does not treat a Slack-only code as auth for other providers", () => {
    expect(classifyIntegrationError("zoom", "account_inactive").kind).toBe("auth");
    expect(classifyIntegrationError("telegram", new Error("Bad request: chat not found")).kind).toBe("other");
  });

  it("accepts plain strings and reports the HTTP status", () => {
    expect(classifyIntegrationError("docuseal", "DocuSeal returned 503: upstream")).toEqual({
      kind: "transient",
      status: 503,
    });
  });
});

describe("sanitizeIntegrationError", () => {
  it("removes query strings, tokens and long opaque identifiers", () => {
    const text = sanitizeIntegrationError(
      new Error(
        "Request to https://api.example.com/v1/items?access_token=abc123&x=1 failed with Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig and refresh_token=rt-secret and token: xyz " +
          "a".repeat(48),
      ),
    );
    expect(text).not.toContain("abc123");
    expect(text).not.toContain("eyJhbGci");
    expect(text).not.toContain("rt-secret");
    expect(text).not.toContain("xyz");
    expect(text).not.toContain("aaaaaaaa");
    expect(text).not.toContain("?");
    expect(text).toContain("https://api.example.com/v1/items");
    expect(text).toContain("refresh_token=[redacted]");
  });

  it("strips basic credentials and control characters", () => {
    expect(sanitizeIntegrationError("Basic dXNlcjpwYXNz failed\n\tbadly")).toBe(
      "Basic [redacted] failed badly",
    );
  });

  it("truncates to the stored maximum, counting characters", () => {
    const text = sanitizeIntegrationError(new Error("word ".repeat(200)));
    expect(Array.from(text).length).toBeLessThanOrEqual(MAX_LAST_ERROR_LENGTH);
    expect(text.endsWith("…")).toBe(true);
  });

  it("is never empty", () => {
    expect(sanitizeIntegrationError(new Error("   "))).toBe("Unknown error");
    expect(sanitizeIntegrationError(undefined)).toBe("Unknown error");
  });
});

describe("integration health state machine", () => {
  const t0 = new Date("2030-01-01T00:00:00.000Z");
  const at = (ms: number) => new Date(t0.getTime() + ms);

  function fail(previous: HealthSnapshot | null, kind: "auth" | "transient" | "other", ms: number) {
    return nextHealthAfterFailure(previous, { kind, message: "boom", now: at(ms) });
  }

  it("moves straight to needs_reconnect on an auth failure", () => {
    const snapshot = fail(null, "auth", 0);
    expect(snapshot.state).toBe("needs_reconnect");
    expect(snapshot.consecutiveFailures).toBe(1);
    expect(snapshot.lastError).toBe("boom");
  });

  it("keeps a connected integration connected until the transient threshold", () => {
    let snapshot: HealthSnapshot | null = null;
    for (let i = 0; i < DEGRADED_FAILURE_THRESHOLD - 1; i += 1) {
      snapshot = fail(snapshot, "transient", i * 1000);
      expect(snapshot.state).toBe("connected");
    }
    snapshot = fail(snapshot, "transient", (DEGRADED_FAILURE_THRESHOLD - 1) * 1000);
    expect(snapshot.state).toBe("degraded");
    expect(snapshot.consecutiveFailures).toBe(DEGRADED_FAILURE_THRESHOLD);
  });

  it("escalates non-transient repeated failures to error", () => {
    let snapshot: HealthSnapshot | null = null;
    for (let i = 0; i < DEGRADED_FAILURE_THRESHOLD; i += 1) {
      snapshot = fail(snapshot, "other", i * 1000);
    }
    expect(snapshot?.state).toBe("error");
  });

  it("does not count failures that are separated by more than the window", () => {
    let snapshot = fail(null, "transient", 0);
    snapshot = fail(snapshot, "transient", FAILURE_WINDOW_MS);
    snapshot = fail(snapshot, "transient", FAILURE_WINDOW_MS * 2 + 1);
    expect(snapshot.consecutiveFailures).toBe(1);
    expect(snapshot.state).toBe("connected");
  });

  it("keeps an auth failure as needs_reconnect even under transient failures", () => {
    let snapshot = fail(null, "auth", 0);
    for (let i = 1; i <= DEGRADED_FAILURE_THRESHOLD + 1; i += 1) {
      snapshot = fail(snapshot, "transient", i * 1000);
    }
    expect(snapshot.state).toBe("needs_reconnect");
  });

  it("resets the streak and returns to connected on success", () => {
    let snapshot = fail(null, "transient", 0);
    snapshot = fail(snapshot, "transient", 1000);
    expect(snapshot.state).toBe("connected");
    expect(snapshot.consecutiveFailures).toBe(2);

    const recovered = nextHealthAfterSuccess(snapshot, at(2000));
    expect(recovered).toMatchObject({
      state: "connected",
      consecutiveFailures: 0,
      lastOkAt: at(2000),
    });

    // A failure after a success starts a new streak, so one more failure is not enough to degrade.
    snapshot = fail(recovered, "transient", 3000);
    snapshot = fail(snapshot, "transient", 4000);
    expect(snapshot.state).toBe("connected");
    expect(snapshot.consecutiveFailures).toBe(2);

    snapshot = fail(snapshot, "transient", 5000);
    expect(snapshot.state).toBe("degraded");

    expect(nextHealthAfterSuccess(snapshot, at(6000)).state).toBe("connected");
  });

  it("recovers from needs_reconnect after a successful call", () => {
    const dead = fail(null, "auth", 0);
    expect(nextHealthAfterSuccess(dead, at(1000)).state).toBe("connected");
  });
});

describe("registry view derivation", () => {
  const stored: StoredHealthRow = {
    state: "needs_reconnect",
    lastOkAt: new Date("2030-01-01T00:00:00.000Z"),
    lastErrorAt: new Date("2030-01-02T00:00:00.000Z"),
    lastError: "invalid_grant",
    consecutiveFailures: 1,
  };

  it("shows connected for a configured integration without stored failures", () => {
    expect(deriveIntegrationState(true, null)).toBe("connected");
  });

  it("reports not connected when unconfigured, unless a reconnect reason is stored", () => {
    expect(deriveIntegrationState(false, null)).toBe("not_connected");
    expect(deriveIntegrationState(false, { ...stored, state: "degraded" })).toBe("not_connected");
    expect(deriveIntegrationState(false, stored)).toBe("needs_reconnect");
  });

  it("builds the public view with ISO timestamps and attention flags", () => {
    expect(buildIntegrationHealthView("gcal", false, stored)).toEqual({
      integration: "gcal",
      state: "needs_reconnect",
      configured: false,
      connected: false,
      reconnectRequired: true,
      needsAttention: true,
      lastOkAt: "2030-01-01T00:00:00.000Z",
      lastErrorAt: "2030-01-02T00:00:00.000Z",
      lastError: "invalid_grant",
      consecutiveFailures: 1,
    });
    expect(buildIntegrationHealthView("slack", true, null)).toMatchObject({
      state: "connected",
      configured: true,
      connected: true,
      reconnectRequired: false,
      needsAttention: false,
      lastError: null,
    });
  });

  it("maps only dead-credential delivery failures to needs_reconnect", () => {
    const at = new Date("2030-01-01T00:00:00.000Z");
    expect(
      healthRowFromDeliveryFailure("slack", { error: "token_revoked", at }),
    ).toMatchObject({ state: "needs_reconnect", lastErrorAt: at });
    expect(healthRowFromDeliveryFailure("slack", { error: "timeout ETIMEDOUT", at })).toBeNull();
    expect(healthRowFromDeliveryFailure("slack", { error: null, at })).toBeNull();
  });
});
