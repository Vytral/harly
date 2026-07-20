import { FileSpreadsheet } from "lucide-react";
import type { ComponentType } from "react";

import {
  AshbyLogo,
  LeverLogo,
  TheSvgLogo,
  WorkableLogo,
} from "@/components/ui/icons/brands";
import { OAuthFeedback } from "@/components/OAuthFeedback";
import { PlugIcon } from "@/components/ui/icons/settings";
import {
  IntegrationMarketplace,
  type MarketplaceGroup,
  type MarketplaceIntegration,
} from "@/features/workspaces/IntegrationMarketplace";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  INTEGRATIONS,
  getIntegrationStatuses,
  getWorkspaceContext,
  isConnected,
  type IntegrationSlug,
} from "@/features/workspaces/integrations-registry";
import { requirePagePermission } from "@/features/workspaces/permissions-server";
import {
  SectionHeader,
  StatusPill,
} from "@/features/workspaces/settings-ui";

export const dynamic = "force-dynamic";

type Logo = ComponentType<{ className?: string }>;

function svgBrand(slug: string, alt: string, variant = "default"): Logo {
  return function SvgBrand({ className }: { className?: string }) {
    return (
      <TheSvgLogo
        slug={slug}
        alt={alt}
        variant={variant}
        className={className}
      />
    );
  };
}

const INTEGRATION_LOGOS: Record<IntegrationSlug, Logo> = {
  cal: svgBrand("caldotcom", "Cal.com", "dark"),
  "google-calendar": svgBrand("google-calendar", "Google Calendar"),
  "google-meet": svgBrand("google-meet", "Google Meet"),
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

const GreenhouseImportLogo = svgBrand("greenhouse", "Greenhouse");

type Importer = {
  id: string;
  name: string;
  description: string;
  logo: Logo;
  logoClassName?: string;
  tileClassName: string;
  href: string;
};

const IMPORTERS: Importer[] = [
  {
    id: "csv",
    name: "CSV import",
    description: "Bring in a spreadsheet of candidates.",
    logo: FileSpreadsheet,
    tileClassName:
      "bg-gradient-to-br from-lime-500 via-lime-300 to-emerald-300 text-white",
    href: "/dashboard/candidates?import=csv",
  },
  {
    id: "greenhouse",
    name: "Greenhouse",
    description: "Move eligible candidates into a Harly pipeline.",
    logo: GreenhouseImportLogo,
    tileClassName:
      "bg-gradient-to-br from-lime-300 via-yellow-300 to-emerald-200",
    href: "/dashboard/candidates?import=greenhouse",
  },
  {
    id: "workable",
    name: "Workable",
    description: "Migrate candidate profiles with a read-only token.",
    logo: WorkableLogo,
    logoClassName: "size-6",
    tileClassName:
      "bg-gradient-to-br from-emerald-100 via-teal-200 to-cyan-300",
    href: "/dashboard/candidates?import=workable",
  },
  {
    id: "ashby",
    name: "Ashby",
    description: "Import complete candidate profiles securely.",
    logo: AshbyLogo,
    logoClassName: "size-6",
    tileClassName:
      "bg-gradient-to-br from-violet-100 via-indigo-200 to-fuchsia-200",
    href: "/dashboard/candidates?import=ashby",
  },
  {
    id: "lever",
    name: "Lever",
    description: "Bring opportunities and candidate details across.",
    logo: LeverLogo,
    logoClassName: "size-6",
    tileClassName:
      "bg-gradient-to-br from-slate-950 via-slate-800 to-slate-600",
    href: "/dashboard/candidates?import=lever",
  },
];

export default async function IntegrationsSettingsPage() {
  await requirePagePermission("integrations:manage");
  const { organization } = await getWorkspaceContext();
  const statuses = await getIntegrationStatuses(organization.id);

  const integrationsConfigured = INTEGRATIONS.some(
    (i) => !i.comingSoon && isConnected(i.slug, statuses),
  );

  const marketplaceGroups: MarketplaceGroup[] = CATEGORY_ORDER.map(
    (category) => ({
      label: CATEGORY_LABELS[category],
      integrations: INTEGRATIONS.filter(
        (i) => i.category === category,
      ).map<MarketplaceIntegration>((i) => {
        const connected = isConnected(i.slug, statuses);
        return {
          id: i.slug,
          name: i.name,
          description: i.description,
          logo: INTEGRATION_LOGOS[i.slug],
          logoClassName: i.logoClassName,
          tileClassName: i.tileClassName,
          href: i.externalHref ?? `/settings/integrations/${i.slug}`,
          status: i.comingSoon
            ? "coming-soon"
            : connected
              ? "connected"
              : "available",
        };
      }),
    }),
  ).filter((g) => g.integrations.length > 0);

  const importerGroups: MarketplaceGroup[] = [
    {
      label: "Sources",
      integrations: IMPORTERS.map<MarketplaceIntegration>((i) => ({
        id: i.id,
        name: i.name,
        description: i.description,
        logo: i.logo,
        logoClassName: i.logoClassName,
        tileClassName: i.tileClassName,
        href: i.href,
        actionLabel: "Import",
        status: "available",
      })),
    },
  ];

  return (
    <div className="space-y-10">
      <OAuthFeedback />

      <div className="border-b border-border/70 pb-5">
        <SectionHeader
          icon={PlugIcon}
          title="Integrations"
          badge={
            <StatusPill tone={integrationsConfigured ? "on" : "neutral"}>
              {integrationsConfigured ? "Configured" : "Not configured"}
            </StatusPill>
          }
          description="Connect calendars, communication tools, and automation to your workspace. Select an integration to set it up."
        />
      </div>

      <IntegrationMarketplace groups={marketplaceGroups} />

      <section className="space-y-4 border-t border-border/70 pt-8">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Data migration
          </p>
          <h2 className="font-display text-xl font-semibold tracking-tight">
            Import candidates
          </h2>
          <p className="text-sm text-muted-foreground">
            One-time migrations from a spreadsheet or another ATS. These run an
            import, not a live connection.
          </p>
        </div>

        <IntegrationMarketplace groups={importerGroups} />
      </section>
    </div>
  );
}
