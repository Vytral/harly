import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata, Route } from "next";
import type { ComponentType, ReactNode } from "react";

import { TheSvgLogo } from "@/components/ui/icons/brands";
import { CaretLeftIcon } from "@/components/ui/icons/phosphor";
import { cn } from "@/lib/utils";
import { CalConnectPanel } from "@/features/workspaces/CalConnectPanel";
import { DiscordConnectPanel } from "@/features/workspaces/DiscordConnectPanel";
import { GCalConnectPanel } from "@/features/workspaces/GCalConnectPanel";
import { JitsiConnectPanel } from "@/features/workspaces/JitsiConnectPanel";
import { OutlookConnectPanel } from "@/features/workspaces/OutlookConnectPanel";
import { SlackConnectPanel } from "@/features/workspaces/SlackConnectPanel";
import { TelegramConnectPanel } from "@/features/workspaces/TelegramConnectPanel";
import { ZoomConnectPanel } from "@/features/workspaces/ZoomConnectPanel";
import {
  getIntegration,
  getWorkspaceContext,
  type IntegrationDefinition,
  type IntegrationSlug,
} from "@/features/workspaces/integrations-registry";
import { requirePagePermission } from "@/features/workspaces/permissions-server";
import { getWorkspaceCalStatus } from "@/lib/cal/config";
import { getWorkspaceGCalStatus } from "@/lib/gcal/config";
import { getWorkspaceJitsiStatus } from "@/lib/jitsi/config";
import { getWorkspaceChatStatus } from "@/lib/notify/config";
import { getWorkspaceOutlookStatus } from "@/lib/outlook/config";
import { getWorkspaceSlackStatus } from "@/lib/slack/config";
import { getWorkspaceTelegramStatus } from "@/lib/telegram/config";
import { getZoomConfig } from "@/lib/zoom/config";
import {
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_LABELS,
} from "@/server/webhooks/events";

export const dynamic = "force-dynamic";

type Logo = ComponentType<{ className?: string }>;

function svgBrand(slug: string, alt: string, variant = "default"): Logo {
  return function SvgBrand({ className }: { className?: string }) {
    return (
      <TheSvgLogo slug={slug} alt={alt} variant={variant} className={className} />
    );
  };
}

const DETAIL_LOGOS: Record<IntegrationSlug, Logo> = {
  cal: svgBrand("caldotcom", "Cal.com", "dark"),
  "google-calendar": svgBrand("google-calendar", "Google Calendar"),
  "outlook-calendar": svgBrand("microsoft-outlook", "Microsoft Outlook"),
  zoom: svgBrand("zoom", "Zoom"),
  jitsi: svgBrand("jitsi", "Jitsi"),
  slack: svgBrand("slack", "Slack"),
  outlook: svgBrand("microsoft-outlook", "Microsoft Outlook"),
  discord: svgBrand("discord", "Discord"),
  telegram: svgBrand("telegram", "Telegram"),
  gmail: svgBrand("gmail", "Gmail"),
  linkedin: svgBrand("linkedin", "LinkedIn"),
  zapier: svgBrand("zapier", "Zapier"),
  webhooks: svgBrand("zapier", "Webhooks"),
};

type DetailPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: DetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const integration = getIntegration(slug);
  if (!integration) return {};
  return { title: `${integration.name} · Integrations` };
}

export default async function IntegrationDetailPage({
  params,
}: DetailPageProps) {
  await requirePagePermission("integrations:manage");
  const { slug } = await params;

  const integration = getIntegration(slug);
  if (!integration) notFound();

  // Automation entries live in the developers surface, not here.
  if (integration.externalHref) redirect(integration.externalHref as Route);

  const { organization, role } = await getWorkspaceContext();
  const canEdit = role === "owner" || role === "admin";

  const eventOptions = WEBHOOK_EVENTS.map((event) => ({
    value: event,
    label: WEBHOOK_EVENT_LABELS[event],
  }));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? null;
  const webhookUrl = appUrl
    ? `${appUrl}/api/webhooks/cal?ws=${organization.id}`
    : null;

  const panel = await renderPanel(integration, {
    organizationId: organization.id,
    canEdit,
    eventOptions,
    webhookUrl,
  });

  return (
    <div className="space-y-8">
      <Link
        href="/settings/integrations"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <CaretLeftIcon className="size-4" />
        Integrations
      </Link>

      {panel ?? <ComingSoon integration={integration} />}
    </div>
  );
}

function ComingSoon({ integration }: { integration: IntegrationDefinition }) {
  const Logo = DETAIL_LOGOS[integration.slug];
  return (
    <>
      <div className="flex items-start gap-4 border-b border-border/70 pb-6">
        <span
          className={cn(
            "flex size-14 shrink-0 items-center justify-center rounded-2xl shadow-sm ring-1 ring-black/5 dark:ring-white/10",
            integration.tileClassName,
          )}
        >
          <Logo className={cn("size-7", integration.logoClassName)} />
        </span>
        <div className="min-w-0 space-y-1.5 pt-0.5">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {integration.name}
          </h1>
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
            {integration.detail}
          </p>
        </div>
      </div>
      <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-6 py-10 text-center">
        <p className="text-sm font-medium text-foreground">Coming soon</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          This integration is on the way. Check back shortly.
        </p>
      </div>
    </>
  );
}

async function renderPanel(
  integration: IntegrationDefinition,
  ctx: {
    organizationId: string;
    canEdit: boolean;
    eventOptions: { value: string; label: string }[];
    webhookUrl: string | null;
  },
): Promise<ReactNode | null> {
  switch (integration.slug) {
    case "cal": {
      const status = await getWorkspaceCalStatus(ctx.organizationId);
      return (
        <CalConnectPanel
          status={status}
          canEdit={ctx.canEdit}
          webhookUrl={ctx.webhookUrl}
          tileClassName={integration.tileClassName}
          description={integration.detail}
        />
      );
    }
    case "google-calendar": {
      const status = await getWorkspaceGCalStatus(ctx.organizationId);
      return (
        <GCalConnectPanel
          status={status}
          canEdit={ctx.canEdit}
          workspaceId={ctx.organizationId}
          tileClassName={integration.tileClassName}
          description={integration.detail}
        />
      );
    }
    case "jitsi": {
      const status = await getWorkspaceJitsiStatus(ctx.organizationId);
      return (
        <JitsiConnectPanel
          status={status}
          canEdit={ctx.canEdit}
          tileClassName={integration.tileClassName}
          description={integration.detail}
        />
      );
    }
    case "slack": {
      const status = await getWorkspaceSlackStatus(ctx.organizationId);
      return (
        <SlackConnectPanel
          status={status}
          events={ctx.eventOptions}
          canEdit={ctx.canEdit}
          workspaceId={ctx.organizationId}
          tileClassName={integration.tileClassName}
          description={integration.detail}
        />
      );
    }
    case "discord": {
      const status = await getWorkspaceChatStatus(ctx.organizationId);
      return (
        <DiscordConnectPanel
          status={status}
          events={ctx.eventOptions}
          canEdit={ctx.canEdit}
          tileClassName={integration.tileClassName}
          description={integration.detail}
        />
      );
    }
    case "telegram": {
      const status = await getWorkspaceTelegramStatus(ctx.organizationId);
      return (
        <TelegramConnectPanel
          status={status}
          events={ctx.eventOptions}
          canEdit={ctx.canEdit}
          tileClassName={integration.tileClassName}
          description={integration.detail}
        />
      );
    }
    case "outlook":
    case "outlook-calendar": {
      const status = await getWorkspaceOutlookStatus(ctx.organizationId);
      return (
        <OutlookConnectPanel
          status={status}
          events={ctx.eventOptions}
          canEdit={ctx.canEdit}
          workspaceId={ctx.organizationId}
          name={integration.name}
          tileClassName={integration.tileClassName}
          description={integration.detail}
        />
      );
    }
    case "zoom": {
      const config = await getZoomConfig(ctx.organizationId);
      return (
        <ZoomConnectPanel
          config={config}
          canEdit={ctx.canEdit}
          workspaceId={ctx.organizationId}
          tileClassName={integration.tileClassName}
          description={integration.detail}
        />
      );
    }
    default:
      return null;
  }
}
