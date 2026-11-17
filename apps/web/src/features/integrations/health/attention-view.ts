/**
 * Presentation facts for integrations that need the user's attention. Pure, so
 * the dashboard card and its tests share one mapping from health key to the
 * integration's name and its settings page.
 */

import type { IntegrationHealthKey } from "./model";

export const ATTENTION_TARGET: Readonly<
  Record<IntegrationHealthKey, { name: string; slug: string; href?: string }>
> = {
  zoom: { name: "Zoom", slug: "zoom" },
  gcal: { name: "Google Calendar", slug: "google-calendar" },
  outlook: { name: "Outlook Calendar", slug: "outlook-calendar" },
  slack: { name: "Slack", slug: "slack" },
  telegram: { name: "Telegram", slug: "telegram" },
  jitsi: { name: "Jitsi Meet", slug: "jitsi" },
  docuseal: { name: "DocuSeal", slug: "docuseal" },
  // AI is configured on its own settings page, not under integrations.
  ai: { name: "AI", slug: "ai", href: "/settings/ai/configure" },
};

export function reconnectHref(integration: IntegrationHealthKey): string {
  const target = ATTENTION_TARGET[integration];
  return target.href ?? `/settings/integrations/${target.slug}`;
}

export function attentionMessage(
  item: { state: "degraded" | "needs_reconnect" | "error" },
  t: (key: string) => string,
): string {
  if (item.state === "needs_reconnect") return t("shell.integrationAttention.accessRevoked");
  return t("shell.integrationAttention.callsFailing");
}
