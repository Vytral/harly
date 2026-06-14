import { API_SCOPES, PUBLISHABLE_SCOPES } from "@harly/api";

import { DevelopersSettings } from "@/features/developers/DevelopersSettings";
import {
  listApiKeys,
  listWebhookEndpoints,
  serializeApiKey,
  serializeWebhookEndpoint,
} from "@/features/developers/data";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { getRolePermissions } from "@/features/workspaces/permissions-server";
import {
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_LABELS,
} from "@/server/webhooks/events";

export const dynamic = "force-dynamic";

export default async function DevelopersSettingsPage() {
  const { organization, roleKey } = await getWorkspaceContext();
  const permissions = await getRolePermissions(organization.id, roleKey);
  const canManage = permissions.includes("integrations:manage");

  const [keys, endpoints] = await Promise.all([
    listApiKeys(organization.id),
    listWebhookEndpoints(organization.id),
  ]);

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");

  return (
    <DevelopersSettings
      canManage={canManage}
      workspaceSlug={organization.slug}
      appUrl={appUrl}
      apiKeys={keys.map(serializeApiKey)}
      webhooks={endpoints.map(serializeWebhookEndpoint)}
      scopes={[...API_SCOPES]}
      publishableScopes={[...PUBLISHABLE_SCOPES]}
      webhookEvents={WEBHOOK_EVENTS.map((event) => ({
        value: event,
        label: WEBHOOK_EVENT_LABELS[event],
      }))}
    />
  );
}
