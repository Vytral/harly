/**
 * Presentation facts for integrations that need the user's attention. Pure, so
 * the dashboard card and its tests share one mapping from health key to the
 * integration's name and its settings page.
 */

import type { IntegrationHealthKey } from "./model";

export const ATTENTION_TARGET: Readonly<
  Record<IntegrationHealthKey, { name: string; slug: string }>
> = {
  zoom: { name: "Zoom", slug: "zoom" },
  gcal: { name: "Google Calendar", slug: "google-calendar" },
  outlook: { name: "Outlook Calendar", slug: "outlook-calendar" },
  slack: { name: "Slack", slug: "slack" },
  telegram: { name: "Telegram", slug: "telegram" },
  jitsi: { name: "Jitsi Meet", slug: "jitsi" },
  docuseal: { name: "DocuSeal", slug: "docuseal" },
};

export function reconnectHref(integration: IntegrationHealthKey): string {
  return `/settings/integrations/${ATTENTION_TARGET[integration].slug}`;
}

export function attentionMessage(
  item: { state: "degraded" | "needs_reconnect" | "error" },
  t: (key: string) => string,
): string {
  if (item.state === "needs_reconnect") return t("shell.integrationAttention.accessRevoked");
  return t("shell.integrationAttention.callsFailing");
}
