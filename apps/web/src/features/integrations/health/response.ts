import type { IntegrationHealthView } from "./model";

/**
 * Shapes the `/api/health/integrations` payload for the caller.
 *
 * The raw per-provider status objects are built for the settings screens and
 * can carry secrets (the DocuSeal inbound webhook shared secret) and account
 * identifiers. Nothing in this API needs them, so:
 *
 * - the webhook secret is never returned, to anyone, and
 * - callers who cannot manage integrations get only coarse health states (no
 *   account emails, host names or error text).
 */

type StatusRecord = Record<string, unknown>;

/** Keys that must never leave the server through the health API. */
const SECRET_KEYS = new Set([
  "webhookSecret",
  "apiToken",
  "accessToken",
  "refreshToken",
  "clientSecret",
  "botToken",
  "token",
  "password",
  "smtpPassword",
]);

export function stripSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => stripSecrets(item)) as T;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: StatusRecord = {};
    for (const [key, inner] of Object.entries(value as StatusRecord)) {
      if (SECRET_KEYS.has(key)) continue;
      out[key] = stripSecrets(inner);
    }
    return out as T;
  }
  return value;
}

export type CoarseIntegrationHealth = Pick<
  IntegrationHealthView,
  "integration" | "state" | "connected" | "reconnectRequired" | "needsAttention" | "lastOkAt"
>;

export function coarseIntegrationHealth(
  integrations: readonly IntegrationHealthView[],
): CoarseIntegrationHealth[] {
  return integrations.map((item) => ({
    integration: item.integration,
    state: item.state,
    connected: item.connected,
    reconnectRequired: item.reconnectRequired,
    needsAttention: item.needsAttention,
    lastOkAt: item.lastOkAt,
  }));
}

export function buildIntegrationHealthResponse(input: {
  canManage: boolean;
  statuses: StatusRecord;
  integrations: readonly IntegrationHealthView[];
}) {
  if (!input.canManage) {
    return { integrations: coarseIntegrationHealth(input.integrations) };
  }
  return {
    statuses: stripSecrets(input.statuses),
    integrations: input.integrations.map((item) => stripSecrets(item)),
  };
}
