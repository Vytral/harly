/**
 * Pure mapping from provider configuration and stored health to the unified
 * per-integration health view. Used by the integrations registry; kept free of
 * server-only imports so it can be unit-tested directly.
 */

import {
  INTEGRATION_HEALTH_KEYS,
  buildIntegrationHealthView,
  healthRowFromDeliveryFailure,
  type IntegrationHealthKey,
  type IntegrationHealthView,
  type StoredHealthRow,
} from "./model";

/** Provider health key for each registry slug; slugs without one are config-only. */
const HEALTH_KEY_BY_SLUG: Readonly<Record<string, IntegrationHealthKey>> = {
  "google-calendar": "gcal",
  "google-meet": "gcal",
  zoom: "zoom",
  "outlook-calendar": "outlook",
  outlook: "outlook",
  "microsoft-teams": "outlook",
  slack: "slack",
  telegram: "telegram",
  jitsi: "jitsi",
  docuseal: "docuseal",
};

export function integrationHealthKeyForSlug(slug: string): IntegrationHealthKey | null {
  return HEALTH_KEY_BY_SLUG[slug] ?? null;
}

export type SlackLastDelivery = {
  status: string;
  error: string | null;
  createdAt: string;
} | null;

/**
 * Slack delivers through a queue, so its failures live in the delivery table.
 * The latest failed delivery with a dead-token error maps into the model, but
 * only when it is newer than the last successful call.
 */
export function withSlackDeliveryHealth(
  stored: Partial<Record<IntegrationHealthKey, StoredHealthRow>>,
  lastDelivery: SlackLastDelivery,
): Partial<Record<IntegrationHealthKey, StoredHealthRow>> {
  if (!lastDelivery) return stored;
  if (lastDelivery.status !== "failed" && lastDelivery.status !== "dead_letter") return stored;
  const deliveredAt = new Date(lastDelivery.createdAt);
  const deliveryRow = healthRowFromDeliveryFailure("slack", {
    error: lastDelivery.error,
    at: deliveredAt,
  });
  if (!deliveryRow) return stored;
  const lastOkAt = stored.slack?.lastOkAt;
  if (lastOkAt && lastOkAt >= deliveredAt) return stored;
  return { ...stored, slack: deliveryRow };
}

/** Builds the health view for every integration from configuration flags and stored rows. */
export function buildHealthByKey(
  configured: Record<IntegrationHealthKey, boolean>,
  stored: Partial<Record<IntegrationHealthKey, StoredHealthRow>>,
): Record<IntegrationHealthKey, IntegrationHealthView> {
  const result = {} as Record<IntegrationHealthKey, IntegrationHealthView>;
  for (const key of INTEGRATION_HEALTH_KEYS) {
    result[key] = buildIntegrationHealthView(key, configured[key], stored[key] ?? null);
  }
  return result;
}
