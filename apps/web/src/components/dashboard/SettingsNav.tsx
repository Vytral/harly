"use client";

import type { Route } from "next";
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";

import {
  BuildingsIcon,
  EnvelopeIcon,
  PlugIcon,
  UsersThreeIcon,
  ShieldIcon,
} from "@/components/ui/icons/settings";
import {
  CodeDuotoneIcon,
  DownloadDuotoneIcon,
  IdentificationCardDuotoneIcon,
  PencilIcon,
  PlugsConnectedIcon,
  RobotDuotoneIcon,
  SealCheckDuotoneIcon,
} from "@/components/ui/icons/phosphor";
import { cn } from "@/lib/utils";

type SettingsSection = {
  href: Route;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
};

type SettingsGroup = { label: string; sections: SettingsSection[] };

const groups: SettingsGroup[] = [
  {
    label: "organization",
    sections: [
      {
        href: "/settings" as Route,
        label: "company",
        hint: "companyHint",
        icon: BuildingsIcon,
        exact: true,
      },
      {
        href: "/settings/members" as Route,
        label: "members",
        hint: "membersHint",
        icon: UsersThreeIcon,
      },
    ],
  },
  {
    label: "candidatesGroup",
    sections: [
      {
        href: "/settings/portal" as Route,
        label: "portal",
        hint: "portalHint",
        icon: IdentificationCardDuotoneIcon,
      },
      {
        href: "/settings/email" as Route,
        label: "email",
        hint: "emailHint",
        icon: EnvelopeIcon,
      },
      {
        href: "/settings/signature" as Route,
        label: "signature",
        hint: "signatureHint",
        icon: PencilIcon,
      },
    ],
  },
  {
    label: "automationGroup",
    sections: [
      {
        href: "/settings/ai" as Route,
        label: "ai",
        hint: "aiHint",
        icon: RobotDuotoneIcon,
      },
      {
        href: "/settings/integrations" as Route,
        label: "integrations",
        hint: "integrationsHint",
        icon: PlugIcon,
      },
      {
        href: "/settings/ai-agents" as Route,
        label: "agents",
        hint: "agentsHint",
        icon: PlugsConnectedIcon,
      },
      {
        href: "/settings/developers" as Route,
        label: "developers",
        hint: "developersHint",
        icon: CodeDuotoneIcon,
      },
    ],
  },
  {
    label: "securityGroup",
    sections: [
      {
        href: "/settings/security" as Route,
        label: "security",
        hint: "securityHint",
        icon: ShieldIcon,
      },
      {
        href: "/settings/legal" as Route,
        label: "legal",
        hint: "legalHint",
        icon: SealCheckDuotoneIcon,
      },
    ],
  },
  {
    label: "installation",
    sections: [
      {
        href: "/settings/updates" as Route,
        label: "updates",
        hint: "updatesHint",
        icon: DownloadDuotoneIcon,
      },
    ],
  },
];

/**
 * "All Settings" (Deel frame 43): a white card holding a search field and the
 * grouped sections. From `lg` it is a vertical card that scrolls on its own;
 * below that it collapses to a single scrollable row of links (no search or
 * group titles), so the page content stays above the fold.
 */
export function SettingsNav({ deniedHrefs }: { deniedHrefs: string[] }) {
  const t = useTranslations("shell.settingsNav");
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  const visibleGroups = groups
    .map((group) => ({
      ...group,
      sections: group.sections.filter(
        (section) =>
          !deniedHrefs.includes(section.href) &&
          (needle === "" ||
            t(section.label).toLowerCase().includes(needle) ||
            t(section.hint).toLowerCase().includes(needle)),
      ),
    }))
    .filter((group) => group.sections.length > 0);

  return (
    <div className="bg-pure-snow shadow-[var(--shadow-card)] max-lg:bg-transparent max-lg:shadow-none lg:max-h-[inherit] lg:overflow-y-auto lg:rounded-[var(--radius-card)] lg:p-3">
      <p className="hidden px-2 pb-3 pt-2 text-[17px] font-semibold tracking-tight text-near-ink lg:block">
        {t("allSettings")}
      </p>
      <label className="relative mb-3 hidden lg:block">
        <span className="sr-only">{t("searchSettings")}</span>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-quiet-mist"
          strokeWidth={1.8}
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          className="h-10 w-full rounded-full border border-mist-border bg-pure-snow pl-9 pr-3 text-base md:text-[14px] text-near-ink placeholder:text-quiet-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
        />
      </label>

      <nav
        aria-label={t("settings")}
        className="scrollbar-hide flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:gap-0 lg:overflow-visible lg:pb-0"
      >
        {visibleGroups.length === 0 ? (
          <p className="px-2 py-3 text-[13px] text-soft-ink">
            {t("noMatches", { query })}
          </p>
        ) : null}
        {visibleGroups.map((group) => (
          <div key={group.label} className="contents lg:mb-2 lg:block">
            <p className="type-col-head hidden px-2 pb-1 pt-3 lg:block">
              {t(group.label)}
            </p>
            {group.sections.map((section) => {
              const active = section.exact
                ? pathname === section.href
                : pathname === section.href ||
                  pathname.startsWith(`${section.href}/`);
              const Icon = section.icon;
              return (
                <Link
                  key={section.href}
                  href={section.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-10 shrink-0 items-center gap-3 rounded-[var(--radius-inner)] px-3 text-[14px] font-medium transition-colors duration-150 ease-out",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink",
                    active
                      ? "bg-card-inset text-near-ink max-lg:bg-pure-snow max-lg:shadow-[var(--shadow-card)]"
                      : "text-near-ink/80 hover:bg-card-inset/70 hover:text-near-ink max-lg:text-soft-ink",
                  )}
                >
                  <Icon className="size-[18px] shrink-0" />
                  <span className="whitespace-nowrap">{t(section.label)}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );
}

function isSectionActive(pathname: string, section: SettingsSection) {
  return section.exact
    ? pathname === section.href
    : pathname === section.href || pathname.startsWith(`${section.href}/`);
}

/**
 * Visible page title for the active settings section (Deel frame 41/43: the
 * section name sits above its cards, with its hint as a quiet subline).
 */
export function SettingsSectionHeading() {
  const t = useTranslations("shell.settingsNav");
  const pathname = usePathname();
  const section = groups
    .flatMap((group) => group.sections)
    .filter((candidate) => isSectionActive(pathname, candidate))
    .sort((a, b) => b.href.length - a.href.length)[0];
  // Detail pages below a section (e.g. one integration) bring their own title.
  if (section && pathname !== section.href) return null;
  return (
    <div className="mb-5 min-w-0">
      <h1 className="font-display break-words text-2xl sm:text-[28px] leading-tight text-near-ink">
        {section ? t(section.label) : t("settings")}
      </h1>
      {section ? (
        <p className="mt-1 text-[14px] text-soft-ink">{t(section.hint)}</p>
      ) : null}
    </div>
  );
}
