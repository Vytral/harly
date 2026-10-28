/**
 * Pure integration-health model: error classification, secret-safe error text
 * and the state machine. No database or server-only imports, so it is shared
 * by the repository, the registry and client components, and unit-tested
 * directly. The SQL upsert in `repository.ts` mirrors `nextHealthAfterFailure`
 * and is verified against it by the gated integration test.
 */

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
 * - `auth`: the provider rejected the credentials (revoked, expired, 401/403).
 * - `transient`: timeouts, 5xx, 408, 429 and network failures.
 * - `other`: any other failure, e.g. a provider validation error.
 */
export type IntegrationFailureKind = "auth" | "transient" | "other";

/** Consecutive failures inside the window before a non-auth failure degrades. */
export const DEGRADED_FAILURE_THRESHOLD = 3;

/** A failure continues the streak when it follows the previous one this closely. */
export const FAILURE_WINDOW_MS = 15 * 60_000;

export const MAX_LAST_ERROR_LENGTH = 300;

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
};

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

/** Pull the message, HTTP status and provider codes out of any thrown value. */
function errorFacts(error: unknown): ErrorFacts {
  if (typeof error === "string") {
    return {
      message: error,
      name: "",
      status: statusFromMessage(error),
      codes: codesFromMessage(error),
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
  return { message, name, status, codes };
}

/**
 * Classify a provider failure. Rate limits win over auth statuses because
 * Google answers some quota errors with HTTP 403.
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
  if (facts.status === 401 || facts.status === 403) {
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

const SECRET_ASSIGNMENT =
  /\b(access_token|refresh_token|id_token|client_secret|api[_-]?key|x-auth-token|token|secret|password|authorization|code)(["']?\s*[:=]\s*["']?)([^\s"',;&}]+)/gi;
const BEARER_OR_BASIC = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const URL_PATTERN = /\bhttps?:\/\/[^\s"'<>)\]]+/gi;
const OPAQUE_TOKEN = /\b[A-Za-z0-9_-]{32,}\b/g;

function stripUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "[url]";
  }
}

/**
 * Turn any thrown value into short, storable text. Query strings, bearer and
 * basic credentials, key=value secrets and long opaque tokens are removed.
 * The result is never empty and is at most MAX_LAST_ERROR_LENGTH characters.
 */
export function sanitizeIntegrationError(error: unknown): string {
  const raw = errorFacts(error).message;
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(URL_PATTERN, (match) => stripUrl(match))
    .replace(BEARER_OR_BASIC, (_match, scheme: string) => `${scheme} [redacted]`)
    .replace(
      SECRET_ASSIGNMENT,
      (_match, name: string, separator: string) => `${name}${separator}[redacted]`,
    )
    .replace(OPAQUE_TOKEN, "[redacted]")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Unknown error";
  const chars = Array.from(cleaned);
  return chars.length > MAX_LAST_ERROR_LENGTH
    ? `${chars.slice(0, MAX_LAST_ERROR_LENGTH - 1).join("")}…`
    : cleaned;
}

// ---- State machine ---------------------------------------------------------

/** A success always means connected. The last error is kept as history. */
export function nextHealthAfterSuccess(
  previous: HealthSnapshot | null,
  now: Date,
): HealthSnapshot {
  return {
    state: "connected",
    consecutiveFailures: 0,
    lastOkAt: now,
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
};

export function nextHealthAfterFailure(
  previous: HealthSnapshot | null,
  failure: HealthFailure,
): HealthSnapshot {
  const consecutiveFailures = continuesFailureStreak(previous, failure.now)
    ? (previous?.consecutiveFailures ?? 0) + 1
    : 1;
  const base: StoredHealthState = previous?.state ?? "connected";

  let state: StoredHealthState;
  if (failure.kind === "auth") {
    state = "needs_reconnect";
  } else if (consecutiveFailures >= DEGRADED_FAILURE_THRESHOLD && base !== "needs_reconnect") {
    state = failure.kind === "transient" ? "degraded" : "error";
  } else {
    state = base;
  }

  return {
    state,
    consecutiveFailures,
    lastOkAt: previous?.lastOkAt ?? null,
    lastErrorAt: failure.now,
    lastError: failure.message,
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
  /** Configured and not in a reconnect-required state. */
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
    connected: configured && state !== "needs_reconnect",
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
