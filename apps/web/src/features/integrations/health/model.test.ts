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
  providerHttpError,
  safeErrorFields,
  sanitizeIntegrationError,
  type HealthSnapshot,
  type StoredHealthRow,
} from "./model";

function apiError(message: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(message), extra);
}

/** Google Calendar error body, shaped like the real REST response. */
function googleError(status: number, reason: string, statusText: string, message = "Request had insufficient authentication scopes.") {
  const body = {
    error: {
      code: status,
      message,
      errors: [{ message, domain: "global", reason }],
      status: statusText,
    },
  };
  return `Google Calendar API ${status}: ${JSON.stringify(body, null, 2)}`;
}

/** Microsoft Graph error body, shaped like the real REST response. */
function graphError(status: number, code: string, message: string) {
  return `Microsoft Graph API ${status}: ${JSON.stringify({ error: { code, message } })}`;
}

describe("classifyIntegrationError", () => {
  it.each([
    ["invalid_grant from Google token refresh", "gcal", new Error("invalid_grant: Token has been expired or revoked."), "auth"],
    ["Microsoft refresh rejection", "outlook", new Error("Token refresh failed: invalid_grant , AADSTS70008"), "auth"],
    ["provider 401 status", "zoom", apiError("Zoom API error: 401", { status: 401 }), "auth"],
    ["401 in a Graph error message", "outlook", new Error("Microsoft Graph API 401: unauthorized"), "auth"],
    ["403 permission failure", "gcal", new Error(googleError(403, "insufficientPermissions", "PERMISSION_DENIED")), "auth"],
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

  it("treats an error state (undecryptable credentials) as not connected", () => {
    const view = buildIntegrationHealthView("zoom", true, {
      state: "error",
      lastOkAt: null,
      lastErrorAt: new Date("2030-01-02T00:00:00.000Z"),
      lastError: "Stored credentials cannot be decrypted — check the encryption key",
      consecutiveFailures: 1,
    });
    expect(view).toMatchObject({ state: "error", connected: false, reconnectRequired: false, needsAttention: true });
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

describe("403 classification reads the structured reason", () => {
  it.each([
    ["Google daily quota", "gcal", googleError(403, "dailyLimitExceeded", "PERMISSION_DENIED", "Daily Limit Exceeded"), "transient"],
    ["Google per-user rate limit", "gcal", googleError(403, "userRateLimitExceeded", "PERMISSION_DENIED", "User Rate Limit Exceeded"), "transient"],
    ["Google rate limit", "gcal", googleError(403, "rateLimitExceeded", "PERMISSION_DENIED"), "transient"],
    ["Google scope problem", "gcal", googleError(403, "insufficientPermissions", "PERMISSION_DENIED"), "auth"],
    ["Google authError reason", "gcal", googleError(403, "authError", "PERMISSION_DENIED"), "auth"],
    ["Google 403 without a credential reason", "gcal", googleError(403, "notFound", "PERMISSION_DENIED", "Not Found"), "other"],
    ["Graph expired token", "outlook", graphError(403, "InvalidAuthenticationToken", "Access token has expired."), "auth"],
    ["Graph request denied", "outlook", graphError(403, "Authorization_RequestDenied", "Insufficient privileges."), "auth"],
    ["Graph access denied", "outlook", graphError(403, "AccessDenied", "Access is denied."), "auth"],
    ["Graph mailbox forbidden for another reason", "outlook", graphError(403, "ErrorAccessDenied", "Access to the mailbox is not allowed."), "other"],
    ["bare 403 with no body", "zoom", apiError("Zoom API error: 403", { status: 403 }), "other"],
    ["403 with an auth code in a structured body", "zoom", apiError("Zoom API error: 403", { status: 403, data: { error: "invalid_grant" } }), "auth"],
    ["401 stays auth regardless of body", "gcal", apiError(googleError(401, "authError", "UNAUTHENTICATED"), { status: 401 }), "auth"],
  ])("%s", (_label, key, error, kind) => {
    expect(classifyIntegrationError(key as never, error).kind).toBe(kind);
  });

  it("reads reasons from a gaxios-shaped response body when the message is generic", () => {
    const error = apiError("Request failed with status code 403", {
      status: 403,
      response: { status: 403, data: { error: { errors: [{ reason: "dailyLimitExceeded" }], status: "PERMISSION_DENIED" } } },
    });
    expect(classifyIntegrationError("gcal", error)).toEqual({ kind: "transient", status: 403 });
  });

  it("treats a bare 403 from Outlook as other, not auth", () => {
    expect(classifyIntegrationError("outlook", new Error("Microsoft Graph API 403: Forbidden")).kind).toBe("other");
  });
});

describe("Telegram credential failures", () => {
  it("maps a 401 Unauthorized from the Bot API to auth", () => {
    const error = Object.assign(new Error("Unauthorized"), { status: 401, reasons: ["Unauthorized"] });
    expect(classifyIntegrationError("telegram", error).kind).toBe("auth");
  });

  it("maps a kicked-bot 403 to auth, as the spec requires", () => {
    const error = Object.assign(new Error("Forbidden: bot was kicked from the group chat"), {
      status: 403,
      reasons: ["Forbidden: bot was kicked from the group chat"],
    });
    expect(classifyIntegrationError("telegram", error)).toEqual({ kind: "auth", status: 403 });
  });

  it("keeps a chat-not-found validation error as other", () => {
    const error = Object.assign(new Error("Bad request: chat not found"), { status: 400 });
    expect(classifyIntegrationError("telegram", error).kind).toBe("other");
  });
});

describe("sanitizeIntegrationError gaps", () => {
  it("redacts camelCase credential keys of any length", () => {
    const text = sanitizeIntegrationError(
      new Error('state {"accessToken":"at-short","refreshToken": "rt-short", clientSecret=cs-short}'),
    );
    expect(text).not.toContain("at-short");
    expect(text).not.toContain("rt-short");
    expect(text).not.toContain("cs-short");
    expect(text).toContain("accessToken");
  });

  it("redacts a short value after an Authorization scheme other than Bearer or Basic", () => {
    const text = sanitizeIntegrationError(new Error("upstream rejected Authorization: Token abc123 for this call"));
    expect(text).not.toContain("abc123");
    expect(text).toContain("Authorization: Token [redacted]");
  });

  it("redacts short credentials that follow an Authorization header without a scheme", () => {
    expect(sanitizeIntegrationError(new Error("Authorization: s3cr3t"))).not.toContain("s3cr3t");
  });

  it("redacts email addresses echoed by a provider", () => {
    const text = sanitizeIntegrationError(
      new Error('DocuSeal API 422: {"error":"jane.doe@example.com has already signed","email":"jane.doe@example.com"}'),
    );
    expect(text).not.toContain("jane.doe");
    expect(text).not.toContain("example.com");
    expect(text).toContain("[email]");
  });

  it("removes a Telegram bot token from a URL path", () => {
    const text = sanitizeIntegrationError(
      new Error("request to https://api.telegram.org/bot123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw/getMe failed"),
    );
    expect(text).not.toContain("AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw");
    expect(text).toContain("https://api.telegram.org/bot[redacted]");
  });

  it("removes Slack bot token shapes regardless of length", () => {
    const text = sanitizeIntegrationError(new Error("slack said xoxb-1234-5678-abcdef is revoked"));
    expect(text).not.toContain("xoxb-1234");
  });
});

describe("state machine: success ordering", () => {
  const t0 = new Date("2030-01-01T00:00:00.000Z");
  const at = (ms: number) => new Date(t0.getTime() + ms);

  it("does not clear reconnect state for a success that started before the auth failure", () => {
    const dead = nextHealthAfterFailure(null, { kind: "auth", message: "invalid_grant", now: at(5000) });
    const late = nextHealthAfterSuccess(dead, at(6000), at(1000));
    expect(late.state).toBe("needs_reconnect");
    expect(late.consecutiveFailures).toBe(1);
    expect(late.lastOkAt).toEqual(at(6000));
  });

  it("clears reconnect state for a success that started after the auth failure", () => {
    const dead = nextHealthAfterFailure(null, { kind: "auth", message: "invalid_grant", now: at(5000) });
    expect(nextHealthAfterSuccess(dead, at(7000), at(6000)).state).toBe("connected");
  });

  it("defaults startedAt to now, so callers that pass nothing keep the old behaviour", () => {
    const dead = nextHealthAfterFailure(null, { kind: "auth", message: "invalid_grant", now: at(5000) });
    expect(nextHealthAfterSuccess(dead, at(6000)).state).toBe("connected");
  });

  it("never moves lastOkAt or lastErrorAt backwards", () => {
    const failed = nextHealthAfterFailure(null, { kind: "transient", message: "ETIMEDOUT", now: at(9000) });
    const late = nextHealthAfterFailure(failed, { kind: "transient", message: "older", now: at(1000) });
    expect(late.lastErrorAt).toEqual(at(9000));
    expect(late.lastError).toBe("ETIMEDOUT");
    expect(nextHealthAfterSuccess(late, at(8000), at(8000)).lastOkAt).toEqual(at(8000));
    const ok = nextHealthAfterSuccess(null, at(8000));
    expect(nextHealthAfterSuccess(ok, at(2000)).lastOkAt).toEqual(at(8000));
  });
});

describe("state machine: expired streak and forced states", () => {
  const t0 = new Date("2030-01-01T00:00:00.000Z");
  const at = (ms: number) => new Date(t0.getTime() + ms);

  it("returns a degraded integration to connected when the streak window has expired", () => {
    let snapshot: HealthSnapshot | null = null;
    for (let i = 0; i < DEGRADED_FAILURE_THRESHOLD; i += 1) {
      snapshot = nextHealthAfterFailure(snapshot, { kind: "transient", message: "ETIMEDOUT", now: at(i * 1000) });
    }
    expect(snapshot?.state).toBe("degraded");

    const later = nextHealthAfterFailure(snapshot, {
      kind: "transient",
      message: "ETIMEDOUT",
      now: at(FAILURE_WINDOW_MS * 3),
    });
    expect(later.state).toBe("connected");
    expect(later.consecutiveFailures).toBe(1);
  });

  it("keeps needs_reconnect when a new streak starts after an auth failure", () => {
    const dead = nextHealthAfterFailure(null, { kind: "auth", message: "invalid_grant", now: at(0) });
    const later = nextHealthAfterFailure(dead, { kind: "transient", message: "ETIMEDOUT", now: at(FAILURE_WINDOW_MS * 3) });
    expect(later.state).toBe("needs_reconnect");
  });

  it("forces degraded immediately without needs_reconnect", () => {
    const snapshot = nextHealthAfterFailure(null, {
      kind: "transient",
      message: "Could not persist rotated tokens",
      now: at(0),
      forceState: "degraded",
    });
    expect(snapshot.state).toBe("degraded");
    expect(snapshot.consecutiveFailures).toBe(1);
  });

  it("forces error immediately for stored credentials that cannot be decrypted", () => {
    const snapshot = nextHealthAfterFailure(null, {
      kind: "other",
      message: "Stored credentials cannot be decrypted — check the encryption key",
      now: at(0),
      forceState: "error",
    });
    expect(snapshot.state).toBe("error");
  });

  it("never lets a forced state overwrite needs_reconnect", () => {
    const dead = nextHealthAfterFailure(null, { kind: "auth", message: "invalid_grant", now: at(0) });
    const forced = nextHealthAfterFailure(dead, { kind: "other", message: "decrypt", now: at(1000), forceState: "error" });
    expect(forced.state).toBe("needs_reconnect");
  });
});

describe("providerHttpError", () => {
  it("keeps the status and the structured reason from a Google body", () => {
    const body = JSON.stringify({
      error: { code: 403, message: "Daily limit", errors: [{ reason: "dailyLimitExceeded" }], status: "PERMISSION_DENIED" },
    });
    const error = providerHttpError("Google Calendar API", 403, body);
    expect(error.message).toBe(`Google Calendar API 403: ${body}`);
    expect(error.status).toBe(403);
    expect(error.reasons).toEqual(["PERMISSION_DENIED", "dailyLimitExceeded"]);
    expect(classifyIntegrationError("gcal", error)).toEqual({ kind: "transient", status: 403 });
  });

  it("keeps a non-JSON body as text with no reasons", () => {
    const error = providerHttpError("Microsoft Graph API", 503, "<html>unavailable</html>");
    expect(error.reasons).toEqual([]);
    expect(classifyIntegrationError("outlook", error).kind).toBe("transient");
  });
});

describe("safeErrorFields for logs", () => {
  it("returns only the sanitized message, status and provider code of a gaxios-shaped error", () => {
    const error = Object.assign(new Error("Request failed with status code 403"), {
      code: 403,
      status: 403,
      config: {
        url: "https://www.googleapis.com/calendar/v3/calendars/primary/events?access_token=ya29.secret-token-value",
        headers: { Authorization: "Bearer ya29.secret-token-value-that-is-long-enough" },
      },
      response: { status: 403, data: { error: { errors: [{ reason: "insufficientPermissions" }] } } },
    });
    const fields = safeErrorFields(error);
    const serialised = JSON.stringify(fields);
    expect(serialised).not.toContain("Authorization");
    expect(serialised).not.toContain("ya29");
    expect(fields).toMatchObject({ status: 403, code: "insufficientPermissions" });
  });

  it("is safe for non-error values", () => {
    expect(safeErrorFields(undefined)).toMatchObject({ message: "Unknown error", status: null, code: null });
  });
});
