/**
 * Pure integration-health model: error classification, secret-safe error text
 * and the state machine. No database or server-only imports, so it is shared
 * by the repository, the registry and client components, and unit-tested
 * directly. The SQL upsert in `repository.ts` mirrors `nextHealthAfterFailure`
 * and `nextHealthAfterSuccess` and is verified against them by the gated
 * integration test.
 */

import { sanitizeErrorMessage } from "@/lib/sanitize-error";

export const INTEGRATION_HEALTH_KEYS = [
  "zoom",
  "gcal",
  "outlook",
  "slack",
  "telegram",
  "jitsi",
  "docuseal",
] as const;

export type IntegrationHealthKey = (typeof INTEGRATION_HEALTH_KEYS)[number];

/** Effective state shown to users. `not_connected` is derived, never stored. */
export type IntegrationHealthState =
  | "connected"
  | "degraded"
  | "needs_reconnect"
  | "error"
  | "not_connected";

/** States that are persisted in `integration_health.state`. */
export type StoredHealthState = Exclude<IntegrationHealthState, "not_connected">;

/**
 * - `auth`: the provider rejected the credentials (revoked, expired, 401, or a
 *   403 that carries a credential reason).
 * - `transient`: timeouts, 5xx, 408, 429, quota reasons and network failures.
 * - `other`: any other failure, e.g. a validation error or an unexplained 403.
 */
export type IntegrationFailureKind = "auth" | "transient" | "other";

/** Consecutive failures inside the window before a non-auth failure degrades. */
export const DEGRADED_FAILURE_THRESHOLD = 3;

/** A failure continues the streak when it follows the previous one this closely. */
export const FAILURE_WINDOW_MS = 15 * 60_000;

export const MAX_LAST_ERROR_LENGTH = 300;

/**
 * Recorded when stored credentials exist but cannot be read (missing or rotated
 * `AI_ENCRYPTION_KEY`). Reconnecting does not help, so it is not a reconnect.
 */
export const CREDENTIALS_UNREADABLE_MESSAGE =
  "Stored credentials cannot be decrypted — check the encryption key";

export type HealthSnapshot = {
  state: StoredHealthState;
  consecutiveFailures: number;
  lastOkAt: Date | null;
  lastErrorAt: Date | null;
  lastError: string | null;
};

// ---- Error classification --------------------------------------------------

/** Provider error codes that always mean the stored credential is unusable. */
const AUTH_CODES = [
  "invalid_grant",
  "invalid_client",
  "unauthorized_client",
  "invalid_token",
  "token_revoked",
  "token_expired",
  "account_inactive",
  "invalid_auth",
  "not_authed",
  "AADSTS70008",
  "AADSTS700082",
  "AADSTS50173",
  "AADSTS700016",
  "AADSTS7000215",
  "AADSTS7000222",
];

/** Slack reports dead bot tokens with these codes only. */
const SLACK_AUTH_CODES = [
  "invalid_auth",
  "token_revoked",
  "account_inactive",
  "token_expired",
  "not_authed",
];

/** Provider error codes that are safe to retry later. */
const TRANSIENT_CODES = [
  "ratelimited",
  "rate_limited",
  "internal_error",
  "fatal_error",
  "service_unavailable",
  "request_timeout",
  "ETIMEDOUT",
  "ESOCKETTIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
];

/**
 * Structured reasons that mean a 403 is a quota or rate problem, not a broken
 * credential. Google answers these with HTTP 403.
 */
const QUOTA_REASONS = new Set([
  "dailyLimitExceeded",
  "quotaExceeded",
  "rateLimitExceeded",
  "userRateLimitExceeded",
  "TooManyRequests",
  "ErrorTooManyRequests",
  "ActivityLimitReached",
]);

/**
 * Per-provider reasons that make a 403 an auth failure. Matched by prefix so a
 * Telegram description such as "Forbidden: bot was kicked from the group chat"
 * matches. Any 403 without one of these reasons is `other`.
 */
const CREDENTIAL_403_BY_KEY: Partial<Record<IntegrationHealthKey, readonly string[]>> = {
  gcal: ["insufficientPermissions", "authError", "forbidden"],
  outlook: ["InvalidAuthenticationToken", "Authorization_RequestDenied", "AccessDenied"],
  telegram: ["Unauthorized", "Forbidden: bot was kicked"],
};

const RATE_LIMIT_PATTERN = /rate.?limit|too many requests|quotaExceeded/i;
const TRANSIENT_PATTERN =
  /\b(ETIMEDOUT|ESOCKETTIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EPIPE|UND_ERR_[A-Z_]+|AbortError|TimeoutError)\b|timed? ?out|socket hang up|network|fetch failed|aborted/i;

export type IntegrationErrorClassification = {
  kind: IntegrationFailureKind;
  /** HTTP status when the error carried one. */
  status: number | null;
};

type ErrorFacts = {
  message: string;
  name: string;
  status: number | null;
  codes: string[];
  /** Structured provider reasons: Google `errors[].reason`, Graph `error.code`, Telegram `description`. */
  reasons: string[];
};

/**
 * Error thrown for a non-2xx provider response. Keeps the HTTP status and the
 * structured reasons so classification never has to parse free text.
 */
export class IntegrationHttpError extends Error {
  readonly status: number;
  readonly reasons: readonly string[];

  constructor(message: string, status: number, reasons: readonly string[] = []) {
    super(message);
    this.name = "IntegrationHttpError";
    this.status = status;
    this.reasons = reasons;
  }
}

/** Build the thrown error for a failed provider response, keeping its status and reasons. */
export function providerHttpError(prefix: string, status: number, body: string): IntegrationHttpError {
  let reasons: string[] = [];
  try {
    reasons = reasonsFromPayload(JSON.parse(body));
  } catch {
    reasons = [];
  }
  return new IntegrationHttpError(`${prefix} ${status}: ${body}`, status, reasons);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function numericStatus(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : null;
}

function statusFromMessage(message: string): number | null {
  const match = /(?:API(?: error)?:?|returned|status)\s*\(?(\d{3})\b/i.exec(message);
  return match ? numericStatus(Number(match[1])) : null;
}

function codesFromMessage(message: string): string[] {
  return (
    message.match(
      /\b(?:invalid_grant|invalid_client|unauthorized_client|invalid_token|token_revoked|token_expired|account_inactive|invalid_auth|not_authed|ratelimited|internal_error|fatal_error|service_unavailable|request_timeout|AADSTS\d+)\b/g,
    ) ?? []
  );
}

/** Reasons carried by a provider JSON payload (Google and Graph `error` objects, Telegram `description`). */
function reasonsFromPayload(payload: unknown): string[] {
  const reasons: string[] = [];
  const record = asRecord(payload);
  if (!record) return reasons;
  const error = asRecord(record.error);
  if (error) {
    if (typeof error.code === "string") reasons.push(error.code);
    if (typeof error.status === "string") reasons.push(error.status);
    if (Array.isArray(error.errors)) {
      for (const item of error.errors) {
        const reason = asRecord(item)?.reason;
        if (typeof reason === "string") reasons.push(reason);
      }
    }
  }
  if (typeof record.description === "string") reasons.push(record.description);
  return reasons;
}

/** Reasons that appear as JSON fields inside a provider message text. */
function reasonsFromMessage(message: string): string[] {
  return [...message.matchAll(/"(?:reason|code|status)"\s*:\s*"([^"]+)"/g)].map((match) => match[1]!);
}

/** Pull the message, HTTP status and provider codes out of any thrown value. */
function errorFacts(error: unknown): ErrorFacts {
  if (typeof error === "string") {
    return {
      message: error,
      name: "",
      status: statusFromMessage(error),
      codes: codesFromMessage(error),
      reasons: reasonsFromMessage(error),
    };
  }
  const record = asRecord(error);
  const message =
    record && typeof record.message === "string" ? record.message : String(error ?? "");
  const name = record && typeof record.name === "string" ? record.name : "";
  const response = asRecord(record?.response);
  const responseData = asRecord(response?.data);
  const data = asRecord(record?.data);
  const status =
    numericStatus(record?.status) ??
    numericStatus(record?.statusCode) ??
    numericStatus(response?.status) ??
    statusFromMessage(message);

  const codes: string[] = [];
  for (const candidate of [
    record?.code,
    record?.error,
    data?.error,
    responseData?.error,
    asRecord(record?.error)?.error,
  ]) {
    if (typeof candidate === "string") codes.push(candidate);
  }
  codes.push(...codesFromMessage(message));

  const reasons: string[] = [];
  if (record && Array.isArray(record.reasons)) {
    for (const reason of record.reasons) {
      if (typeof reason === "string") reasons.push(reason);
    }
  }
  for (const payload of [record, responseData, data]) {
    reasons.push(...reasonsFromPayload(payload));
  }
  reasons.push(...reasonsFromMessage(message));

  return { message, name, status, codes, reasons };
}

/** Classify a 403 from its structured reason. Quota is transient, credential reasons are auth, anything else is other. */
function classifyForbidden(
  key: IntegrationHealthKey,
  facts: ErrorFacts,
  authCodes: readonly string[],
): IntegrationFailureKind {
  if (facts.reasons.some((reason) => QUOTA_REASONS.has(reason))) return "transient";
  const credentialReasons = CREDENTIAL_403_BY_KEY[key] ?? [];
  const candidates = [...facts.reasons, facts.message];
  const credentialReason = credentialReasons.some((prefix) =>
    candidates.some((candidate) => candidate.startsWith(prefix)),
  );
  if (credentialReason) return "auth";
  if (facts.codes.some((code) => authCodes.includes(code))) return "auth";
  return "other";
}

/**
 * Classify a provider failure. Rate limits win over auth statuses. A 403 is an
 * auth failure only when its structured reason says the credential is at fault.
 */
export function classifyIntegrationError(
  key: IntegrationHealthKey,
  error: unknown,
): IntegrationErrorClassification {
  const facts = errorFacts(error);
  const authCodes = key === "slack" ? [...AUTH_CODES, ...SLACK_AUTH_CODES] : AUTH_CODES;

  if (facts.status === 429 || RATE_LIMIT_PATTERN.test(facts.message)) {
    return { kind: "transient", status: facts.status };
  }
  if (facts.status === 403) {
    return { kind: classifyForbidden(key, facts, authCodes), status: 403 };
  }
  if (facts.status === 401) {
    return { kind: "auth", status: facts.status };
  }
  if (facts.codes.some((code) => authCodes.includes(code))) {
    return { kind: "auth", status: facts.status };
  }
  if (
    facts.status === 408 ||
    (facts.status !== null && facts.status >= 500 && facts.status <= 599) ||
    facts.codes.some((code) => TRANSIENT_CODES.includes(code)) ||
    TRANSIENT_PATTERN.test(facts.message) ||
    TRANSIENT_PATTERN.test(facts.name)
  ) {
    return { kind: "transient", status: facts.status };
  }
  return { kind: "other", status: facts.status };
}

// ---- Secret-safe error text ------------------------------------------------

/**
 * Turn any thrown value into short, storable text. Query strings, credentials
 * in headers and key=value pairs (camelCase included), email addresses, bot
 * tokens and long opaque identifiers are removed. The result is never empty
 * and is at most MAX_LAST_ERROR_LENGTH characters.
 */
export function sanitizeIntegrationError(error: unknown): string {
  return (
    sanitizeErrorMessage(errorFacts(error).message, MAX_LAST_ERROR_LENGTH) ||
    "Unknown error"
  );
}

/** Sanitized fields for a log line. Never includes the raw error object, whose request config can carry headers. */
export type SafeErrorFields = {
  message: string;
  status: number | null;
  code: string | null;
};

export function safeErrorFields(error: unknown): SafeErrorFields {
  const facts = errorFacts(error);
  return {
    message: sanitizeIntegrationError(error),
    status: facts.status,
    code: facts.reasons[0] ?? facts.codes[0] ?? null,
  };
}

// ---- State machine ---------------------------------------------------------

function laterOf(a: Date | null, b: Date): Date {
  return a && a.getTime() > b.getTime() ? a : b;
}

/**
 * A success clears the failure state, unless a failure was recorded after this
 * call started. `startedAt` defaults to `now`, which keeps the plain behaviour
 * for callers that have no start time. Timestamps never move backwards.
 */
export function nextHealthAfterSuccess(
  previous: HealthSnapshot | null,
  now: Date,
  startedAt: Date = now,
): HealthSnapshot {
  const failedAfterStart =
    previous?.lastErrorAt != null && previous.lastErrorAt.getTime() >= startedAt.getTime();
  if (previous && failedAfterStart) {
    return { ...previous, lastOkAt: laterOf(previous.lastOkAt, now) };
  }
  return {
    state: "connected",
    consecutiveFailures: 0,
    lastOkAt: laterOf(previous?.lastOkAt ?? null, now),
    lastErrorAt: previous?.lastErrorAt ?? null,
    lastError: previous?.lastError ?? null,
  };
}

/** True when a failure at `now` extends the streak that `previous` started. */
export function continuesFailureStreak(
  previous: HealthSnapshot | null,
  now: Date,
): boolean {
  if (!previous || previous.consecutiveFailures <= 0 || !previous.lastErrorAt) return false;
  return now.getTime() - previous.lastErrorAt.getTime() <= FAILURE_WINDOW_MS;
}

export type HealthFailure = {
  kind: IntegrationFailureKind;
  /** Already sanitized, see `sanitizeIntegrationError`. */
  message: string;
  now: Date;
  /**
   * Sets the state for this failure immediately instead of after the streak
   * threshold, for failures where the stored state itself is at risk (e.g.
   * credentials that cannot be decrypted). Never overwrites `needs_reconnect`.
   */
  forceState?: "degraded" | "error";
};

/**
 * Failure transition. A failure that starts a new streak (the previous one fell
 * out of the window) begins from `connected`, not from the old degraded state.
 * `needs_reconnect` is kept until a successful call clears it.
 */
export function nextHealthAfterFailure(
  previous: HealthSnapshot | null,
  failure: HealthFailure,
): HealthSnapshot {
  const continues = continuesFailureStreak(previous, failure.now);
  const consecutiveFailures = continues ? (previous?.consecutiveFailures ?? 0) + 1 : 1;
  const carried: StoredHealthState =
    previous?.state === "needs_reconnect"
      ? "needs_reconnect"
      : continues && previous
        ? previous.state
        : "connected";

  let state: StoredHealthState;
  if (failure.kind === "auth") {
    state = "needs_reconnect";
  } else if (carried === "needs_reconnect") {
    state = carried;
  } else if (failure.forceState) {
    state = failure.forceState;
  } else if (consecutiveFailures >= DEGRADED_FAILURE_THRESHOLD) {
    state = failure.kind === "transient" ? "degraded" : "error";
  } else {
    state = carried;
  }

  const newest = !previous?.lastErrorAt || failure.now.getTime() >= previous.lastErrorAt.getTime();
  return {
    state,
    consecutiveFailures,
    lastOkAt: previous?.lastOkAt ?? null,
    lastErrorAt: newest ? failure.now : previous?.lastErrorAt ?? failure.now,
    lastError: newest ? failure.message : previous?.lastError ?? failure.message,
  };
}

// ---- Registry view ---------------------------------------------------------

export type StoredHealthRow = {
  state: StoredHealthState;
  lastOkAt: Date | null;
  lastErrorAt: Date | null;
  lastError: string | null;
  consecutiveFailures: number;
};

export type IntegrationHealthView = {
  integration: IntegrationHealthKey;
  state: IntegrationHealthState;
  /** Credentials/settings are present (independent of health). */
  configured: boolean;
  /**
   * Configured and usable: not in a reconnect-required state, and not in an
   * error state where the stored credentials cannot be decrypted.
   */
  connected: boolean;
  /** True when the user must reconnect the integration (auth failure). */
  reconnectRequired: boolean;
  /** True when the state is degraded, error or reconnect required. */
  needsAttention: boolean;
  lastOkAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
};

/**
 * Effective state for the UI. An unconfigured integration reads as not
 * connected, except a stored auth failure: that keeps the reconnect reason
 * visible after the dead credentials were cleared.
 */
export function deriveIntegrationState(
  configured: boolean,
  stored: StoredHealthRow | null,
): IntegrationHealthState {
  if (!configured) {
    return stored?.state === "needs_reconnect" ? "needs_reconnect" : "not_connected";
  }
  return stored?.state ?? "connected";
}

export function buildIntegrationHealthView(
  integration: IntegrationHealthKey,
  configured: boolean,
  stored: StoredHealthRow | null,
): IntegrationHealthView {
  const state = deriveIntegrationState(configured, stored);
  return {
    integration,
    state,
    configured,
    connected: configured && state !== "needs_reconnect" && state !== "error",
    reconnectRequired: state === "needs_reconnect",
    needsAttention: state === "needs_reconnect" || state === "degraded" || state === "error",
    lastOkAt: stored?.lastOkAt?.toISOString() ?? null,
    lastErrorAt: stored?.lastErrorAt?.toISOString() ?? null,
    lastError: stored?.lastError ?? null,
    consecutiveFailures: stored?.consecutiveFailures ?? 0,
  };
}

/**
 * Maps the latest delivery failure of a delivery-based integration (Slack) to
 * a stored-health row. Only dead-credential failures are mapped; transient
 * delivery failures are already retried by the dispatcher.
 */
export function healthRowFromDeliveryFailure(
  key: IntegrationHealthKey,
  input: { error: string | null; at: Date },
): StoredHealthRow | null {
  if (!input.error) return null;
  if (classifyIntegrationError(key, input.error).kind !== "auth") return null;
  return {
    state: "needs_reconnect",
    lastOkAt: null,
    lastErrorAt: input.at,
    lastError: sanitizeIntegrationError(input.error),
    consecutiveFailures: 1,
  };
}

/** Human label for a state, used by badges and the attention card. */
export const INTEGRATION_STATE_LABEL: Record<IntegrationHealthState, string> = {
  connected: "Connected",
  degraded: "Needs attention",
  needs_reconnect: "Reconnect required",
  error: "Needs attention",
  not_connected: "Not connected",
};

export function isIntegrationHealthKey(value: string): value is IntegrationHealthKey {
  return (INTEGRATION_HEALTH_KEYS as readonly string[]).includes(value);
}
