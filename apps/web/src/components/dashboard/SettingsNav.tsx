"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  BuildingsIcon,
  EnvelopeIcon,
  PlugIcon,
  UsersThreeIcon,
} from "@/components/ui/icons/settings";
import {
  CodeDuotoneIcon,
  RobotDuotoneIcon,
} from "@/components/ui/icons/phosphor";
import { SETTINGS_SECTION_PERMISSION } from "@/features/workspaces/permissions";
import { cn } from "@/lib/utils";

type SettingsSection = {
  href: Route;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
};

const sections: SettingsSection[] = [
  {
    href: "/settings" as Route,
    label: "Company & brand",
    hint: "Logo, color, careers page",
    icon: BuildingsIcon,
    exact: true,
  },
  {
    href: "/settings/members" as Route,
    label: "Members & roles",
    hint: "Teammates and permissions",
    icon: UsersThreeIcon,
  },
  {
    href: "/settings/ai" as Route,
    label: "AI",
    hint: "Parsing & drafting models",
    icon: RobotDuotoneIcon,
  },
  {
    href: "/settings/email" as Route,
    label: "Email",
    hint: "Sending domain & provider",
    icon: EnvelopeIcon,
  },
  {
    href: "/settings/integrations" as Route,
    label: "Integrations",
    hint: "Calendar, chat & more",
    icon: PlugIcon,
  },
  {
    href: "/settings/developers" as Route,
    label: "Developers & API",
    hint: "Keys, webhooks, embed",
    icon: CodeDuotoneIcon,
  },
];

export function SettingsNav({ allowedHrefs }: { allowedHrefs: string[] }) {
  const pathname = usePathname();

  // A section shows when it isn't permission-gated (absent from the map) or the
  // viewer holds the required permission (its href is in allowedHrefs).
  const visible = sections.filter(
    (section) =>
      !(section.href in SETTINGS_SECTION_PERMISSION) ||
      allowedHrefs.includes(section.href),
  );

  return (
    <nav className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:pb-0">
      {visible.map((section) => {
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
              "group relative flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 transition-colors lg:shrink",
              active
                ? "bg-card shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:bg-accent/60",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "absolute left-0 top-1/2 hidden h-6 w-1 -translate-y-1/2 rounded-full bg-pine transition-opacity lg:block",
                active ? "opacity-100" : "opacity-0",
              )}
            />
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                active
                  ? "bg-sage text-pine"
                  : "bg-muted/70 text-muted-foreground group-hover:text-foreground",
              )}
            >
              <Icon className="size-[18px]" />
            </span>
            <span className="min-w-0">
              <span
                className={cn(
                  "block whitespace-nowrap text-sm font-medium",
                  active ? "text-foreground" : "text-foreground/80",
                )}
              >
                {section.label}
              </span>
              <span className="hidden truncate text-xs text-muted-foreground lg:block">
                {section.hint}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
