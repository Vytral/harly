import { API_SCOPES, PUBLISHABLE_SCOPES } from "@harly/api";

import { DevelopersSettings } from "@/features/developers/DevelopersSettings";
import {
  getLastWebhookDelivery,
  listApiKeys,
  listWebhookEndpoints,
  serializeApiKey,
  serializeWebhookEndpoint,
} from "@/features/developers/data";
import { getWorkspaceContext } from "@/features/workspaces/context";
import {
  getRolePermissions,
  requirePagePermission,
} from "@/features/workspaces/permissions-server";
import {
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_LABELS,
} from "@/server/webhooks/events";
import { getHarlyPublicOrigin } from "@/lib/public-origin";

export const dynamic = "force-dynamic";

export default async function DevelopersSettingsPage() {
  await requirePagePermission("integrations:manage");
  const { organization, roleKey } = await getWorkspaceContext();
  const permissions = await getRolePermissions(organization.id, roleKey);
  const canManage = permissions.includes("integrations:manage");

  const [keys, endpoints] = await Promise.all([
    listApiKeys(organization.id),
    listWebhookEndpoints(organization.id),
  ]);

  const webhooks = await Promise.all(
    endpoints.map(async (endpoint) => ({
      ...serializeWebhookEndpoint(endpoint),
      lastDelivery: await getLastWebhookDelivery({
        workspaceId: organization.id,
        endpointId: endpoint.id,
      }),
    })),
  );

  const appUrl = getHarlyPublicOrigin();

  return (
    <DevelopersSettings
      canManage={canManage}
      appUrl={appUrl}
      apiKeys={keys.map(serializeApiKey)}
      webhooks={webhooks}
      scopes={[...API_SCOPES]}
      publishableScopes={[...PUBLISHABLE_SCOPES]}
      webhookEvents={WEBHOOK_EVENTS.map((event) => ({
        value: event,
        label: WEBHOOK_EVENT_LABELS[event],
      }))}
    />
  );
}
