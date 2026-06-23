import { CalSettingsCard } from "@/features/workspaces/CalSettingsCard";
import { GCalSettingsCard } from "@/features/workspaces/GCalSettingsCard";
import { SlackSettingsCard } from "@/features/workspaces/SlackSettingsCard";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { requirePagePermission } from "@/features/workspaces/permissions-server";
import { getWorkspaceCalStatus } from "@/lib/cal/config";
import { getWorkspaceGCalStatus } from "@/lib/gcal/config";
import { getWorkspaceSlackStatus } from "@/lib/slack/config";
import {
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_LABELS,
} from "@/server/webhooks/events";
import { BrandTile } from "@/features/workspaces/settings-ui";
import {
  GmailLogo,
  GreenhouseLogo,
  LinkedinLogo,
} from "@/components/ui/icons/brands";
import { Card } from "@/components/ui/card";
import { OAuthFeedback } from "@/components/OAuthFeedback";

export const dynamic = "force-dynamic";

const UPCOMING: Array<{
  name: string;
  description: string;
  logo: React.ComponentType<{ className?: string }>;
  tone?: string;
}> = [
  {
    name: "Gmail",
    description: "Send and log candidate emails from your own inbox.",
    logo: GmailLogo,
  },
  {
    name: "Greenhouse",
    description: "Import jobs and candidates from an existing Greenhouse account.",
    logo: GreenhouseLogo,
  },
  {
    name: "LinkedIn",
    description: "Publish jobs and receive applications from LinkedIn.",
    logo: LinkedinLogo,
  },
];

export default async function IntegrationsSettingsPage() {
  await requirePagePermission("integrations:manage");
  const { organization, role } = await getWorkspaceContext();
  const [calStatus, gcalStatus, slackStatus] = await Promise.all([
    getWorkspaceCalStatus(organization.id),
    getWorkspaceGCalStatus(organization.id),
    getWorkspaceSlackStatus(organization.id),
  ]);
  const canEdit = role === "owner" || role === "admin";

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? null;
  const webhookUrl = appUrl
    ? `${appUrl}/api/webhooks/cal?ws=${organization.id}`
    : null;

  const eventOptions = WEBHOOK_EVENTS.map((event) => ({
    value: event,
    label: WEBHOOK_EVENT_LABELS[event],
  }));

  return (
    <div className="space-y-6">
      <OAuthFeedback />

      <CalSettingsCard
        status={calStatus}
        canEdit={canEdit}
        webhookUrl={webhookUrl}
      />

      <GCalSettingsCard
        status={gcalStatus}
        canEdit={canEdit}
        workspaceId={organization.id}
      />

        <SlackSettingsCard
          status={slackStatus}
          events={eventOptions}
          canEdit={canEdit}
          workspaceId={organization.id}
        />

        <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            On the roadmap
          </h3>
          <p className="text-xs text-muted-foreground/70">
            Want one sooner? Tell us in Developers &amp; API.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {UPCOMING.map((integration) => {
            const Logo = integration.logo;
            return (
              <Card
                key={integration.name}
                className="gap-0 p-5 transition-colors hover:border-foreground/15"
              >
                <div className="flex items-start gap-3">
                  <BrandTile className="size-11 rounded-2xl">
                    <Logo className={integration.tone ?? undefined} />
                  </BrandTile>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold tracking-tight">
                        {integration.name}
                      </h4>
                      <span className="rounded-full border border-dashed px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        Coming soon
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {integration.description}
                    </p>
                  </div>
                  
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
