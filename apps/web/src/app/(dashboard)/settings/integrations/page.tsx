import type { LucideIcon } from "lucide-react";
import { CalendarPlus, Mail, Plug, Share2 } from "lucide-react";

import { CalSettingsCard } from "@/features/workspaces/CalSettingsCard";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { getWorkspaceCalStatus } from "@/lib/cal/config";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

// Future integrations — rendered as inert "coming soon" cards so the surface is
// visibly extensible (Google Calendar, Gmail, Greenhouse, LinkedIn, …).
const UPCOMING: Array<{ name: string; description: string; icon: LucideIcon }> = [
  {
    name: "Google Calendar",
    description: "Two-way sync interviews with recruiters' Google calendars.",
    icon: CalendarPlus,
  },
  {
    name: "Gmail",
    description: "Send and log candidate emails from your own inbox.",
    icon: Mail,
  },
  {
    name: "Greenhouse",
    description: "Import jobs and candidates from an existing Greenhouse account.",
    icon: Plug,
  },
  {
    name: "LinkedIn",
    description: "Publish jobs and receive applications from LinkedIn.",
    icon: Share2,
  },
];

export default async function IntegrationsSettingsPage() {
  const { organization, role } = await getWorkspaceContext();
  const status = await getWorkspaceCalStatus(organization.id);
  const canEdit = role === "owner" || role === "admin";

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? null;
  const webhookUrl = appUrl
    ? `${appUrl}/api/webhooks/cal?ws=${organization.id}`
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">Integrations</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect Harly to the tools your team already uses.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CalSettingsCard status={status} canEdit={canEdit} webhookUrl={webhookUrl} />

        {UPCOMING.map((integration) => {
          const Icon = integration.icon;
          return (
            <Card key={integration.name} className="flex flex-col opacity-75">
              <div className="flex items-start gap-3 p-5">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold tracking-tight">
                      {integration.name}
                    </h3>
                    <span className="rounded-full border border-dashed px-2 py-0.5 text-xs font-medium text-muted-foreground">
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
  );
}
