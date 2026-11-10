import { FileSpreadsheet } from "lucide-react";
import type { ComponentType } from "react";
import { getTranslations } from "next-intl/server";

import {
  AshbyLogo,
  CloudflareLogo,
  DocuSealLogo,
  HCaptchaLogo,
  JoinLogo,
  LeverLogo,
  ReCaptchaLogo,
  TheSvgLogo,
  WorkableLogo,
} from "@/components/ui/icons/brands";
import { OAuthFeedback } from "@/components/OAuthFeedback";
import { PlugIcon } from "@/components/ui/icons/settings";
import { PencilIcon } from "@/components/ui/icons/phosphor";
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
import { integrationHealthKeyForSlug } from "@/features/integrations/health/registry-mapping";
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
  "microsoft-teams": svgBrand("microsoft-teams", "Microsoft Teams"),
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
  "harly-sign": PencilIcon,
  docuseal: DocuSealLogo,
  turnstile: CloudflareLogo,
  recaptcha: ReCaptchaLogo,
  hcaptcha: HCaptchaLogo,
};

const GreenhouseImportLogo = svgBrand("greenhouse", "Greenhouse");

type Importer = {
  id: string;
  /** Vendor or product name. Omitted when the label is translated. */
  name?: string;
  logo: Logo;
  logoClassName?: string;
  tileClassName: string;
  href: string;
};

const IMPORTERS: Importer[] = [
  {
    id: "csv",
    logo: FileSpreadsheet,
    tileClassName:
      "bg-gradient-to-br from-lime-500 via-lime-300 to-emerald-300 text-white",
    href: "/dashboard/candidates?import=csv",
  },
  {
    id: "greenhouse",
    name: "Greenhouse",
    logo: GreenhouseImportLogo,
    tileClassName:
      "bg-gradient-to-br from-lime-300 via-yellow-300 to-emerald-200",
    href: "/dashboard/candidates?import=greenhouse",
  },
  {
    id: "workable",
    name: "Workable",
    logo: WorkableLogo,
    logoClassName: "size-6",
    tileClassName:
      "bg-gradient-to-br from-emerald-100 via-teal-200 to-cyan-300",
    href: "/dashboard/candidates?import=workable",
  },
  {
    id: "ashby",
    name: "Ashby",
    logo: AshbyLogo,
    logoClassName: "size-6",
    tileClassName:
      "bg-muted text-foreground ring-1 ring-border",
    href: "/dashboard/candidates?import=ashby",
  },
  {
    id: "lever",
    name: "Lever",
    logo: LeverLogo,
    logoClassName: "size-6",
    tileClassName:
      "bg-gradient-to-br from-slate-950 via-slate-800 to-slate-600",
    href: "/dashboard/candidates?import=lever",
  },
  {
    id: "join",
    name: "JOIN.com",
    logo: JoinLogo,
    logoClassName: "size-6",
    tileClassName: "bg-gradient-to-br from-zinc-100 via-stone-200 to-neutral-300",
    href: "/dashboard/candidates?import=join",
  },
];

export default async function IntegrationsSettingsPage() {
  const t = await getTranslations("pages.settingsIntegrations.page");
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
        const healthKey = integrationHealthKeyForSlug(i.slug);
        const health = healthKey ? statuses.health[healthKey] : null;
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
            : health?.reconnectRequired
              ? "reconnect"
              : health?.state === "degraded" || health?.state === "error"
                ? "attention"
                : connected
                  ? "connected"
                  : "available",
        };
      }),
    }),
  ).filter((g) => g.integrations.length > 0);

  const importAction = t("importAction");

  const importerGroups: MarketplaceGroup[] = [
    {
      label: t("groups.sources"),
      integrations: IMPORTERS.map<MarketplaceIntegration>((i) => ({
        id: i.id,
        name: i.name ?? t("importers.csv.name"),
        description: t(`importers.${i.id}.description`),
        logo: i.logo,
        logoClassName: i.logoClassName,
        tileClassName: i.tileClassName,
        href: i.href,
        actionLabel: importAction,
        status: "available",
      })),
    },
  ];

  const joinMarketplaceIntegration: MarketplaceIntegration = {
    id: "join-import",
    name: "JOIN.com",
    description: t("joinMarketplace.description"),
    logo: JoinLogo,
    logoClassName: "size-6",
    tileClassName:
      "bg-gradient-to-br from-zinc-100 via-stone-200 to-neutral-300",
    href: "/dashboard/candidates?import=join",
    actionLabel: importAction,
    status: "available",
  };

  const marketplaceGroupsWithSources: MarketplaceGroup[] = [
    ...marketplaceGroups,
    {
      label: t("groups.candidateSources"),
      integrations: [joinMarketplaceIntegration],
    },
  ];

  return (
    <div className="space-y-10">
      <OAuthFeedback />

      <div className="border-b border-border/70 pb-5">
        <SectionHeader
          icon={PlugIcon}
          title={t("title")}
          badge={
            <StatusPill tone={integrationsConfigured ? "on" : "neutral"}>
              {integrationsConfigured ? t("configured") : t("notConfigured")}
            </StatusPill>
          }
          description={t("description")}
        />
      </div>

      <IntegrationMarketplace groups={marketplaceGroupsWithSources} />

      <section className="space-y-4 border-t border-border/70 pt-8">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t("migration.eyebrow")}
          </p>
          <h2 className="font-display text-xl font-semibold tracking-tight">
            {t("migration.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("migration.description")}
          </p>
        </div>

        <IntegrationMarketplace groups={importerGroups} />
      </section>
    </div>
  );
}
