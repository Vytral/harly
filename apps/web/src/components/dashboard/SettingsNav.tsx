"use client";

import type { Route } from "next";
import { useState } from "react";
import Link from "next/link";
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
  IdentificationCardDuotoneIcon,
  PencilIcon,
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
    label: "Organization",
    sections: [
      {
        href: "/settings" as Route,
        label: "Company & brand",
        hint: "Logo, colors, careers page, and other organization-wide settings.",
        icon: BuildingsIcon,
        exact: true,
      },
      {
        href: "/settings/members" as Route,
        label: "Members & roles",
        hint: "Teammates, permissions, and access control settings.",
        icon: UsersThreeIcon,
      },
    ],
  },
  {
    label: "Candidates",
    sections: [
      {
        href: "/settings/portal" as Route,
        label: "Candidate Portal",
        hint: "Self-service portal for candidates to view applications and update their profile.",
        icon: IdentificationCardDuotoneIcon,
      },
      {
        href: "/settings/email" as Route,
        label: "Email",
        hint: "Email delivery and reply routing settings.",
        icon: EnvelopeIcon,
      },
      {
        href: "/settings/signature" as Route,
        label: "Harly Signature",
        hint: "Native signing, remote links, OTP security, and evidence settings.",
        icon: PencilIcon,
      },
    ],
  },
  {
    label: "Automation & AI",
    sections: [
      {
        href: "/settings/ai" as Route,
        label: "AI",
        hint: "Parsing & drafting models, AI features, and usage insights.",
        icon: RobotDuotoneIcon,
      },
      {
        href: "/settings/integrations" as Route,
        label: "Integrations",
        hint: "Connect your tools and automate your workflow.",
        icon: PlugIcon,
      },
      {
        href: "/settings/developers" as Route,
        label: "Developers & API",
        hint: "API keys, webhooks, and developer tools.",
        icon: CodeDuotoneIcon,
      },
    ],
  },
  {
    label: "Security & compliance",
    sections: [
      {
        href: "/settings/security" as Route,
        label: "Security",
        hint: "2FA, SSO, passkeys, and access audit logs.",
        icon: ShieldIcon,
      },
      {
        href: "/settings/legal" as Route,
        label: "Legal & Compliance",
        hint: "Legal entity, retention policies, privacy policy, and terms.",
        icon: SealCheckDuotoneIcon,
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
            section.label.toLowerCase().includes(needle) ||
            section.hint.toLowerCase().includes(needle)),
      ),
    }))
    .filter((group) => group.sections.length > 0);

  return (
    <div className="bg-pure-snow shadow-[var(--shadow-card)] max-lg:bg-transparent max-lg:shadow-none lg:max-h-[inherit] lg:overflow-y-auto lg:rounded-[var(--radius-card)] lg:p-3">
      <p className="hidden px-2 pb-3 pt-2 text-[17px] font-semibold tracking-tight text-near-ink lg:block">
        All Settings
      </p>
      <label className="relative mb-3 hidden lg:block">
        <span className="sr-only">Search settings</span>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-quiet-mist"
          strokeWidth={1.8}
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search setting"
          className="h-10 w-full rounded-full border border-mist-border bg-pure-snow pl-9 pr-3 text-[14px] text-near-ink placeholder:text-quiet-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
        />
      </label>

      <nav
        aria-label="Settings"
        className="scrollbar-hide flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:gap-0 lg:overflow-visible lg:pb-0"
      >
        {visibleGroups.length === 0 ? (
          <p className="px-2 py-3 text-[13px] text-soft-ink">
            No settings match &ldquo;{query}&rdquo;.
          </p>
        ) : null}
        {visibleGroups.map((group) => (
          <div key={group.label} className="contents lg:mb-2 lg:block">
            <p className="type-col-head hidden px-2 pb-1 pt-3 lg:block">
              {group.label}
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
                  <span className="whitespace-nowrap">{section.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );
}
