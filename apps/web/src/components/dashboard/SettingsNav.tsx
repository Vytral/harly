"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Code2 } from "lucide-react";

import {
  BuildingsIcon,
  EnvelopeIcon,
  PlugIcon,
  SparkleIcon,
  UsersThreeIcon,
} from "@/components/ui/icons/settings";
import { cn } from "@/lib/utils";

type SettingsSection = {
  href: Route;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
};

const sections: SettingsSection[] = [
  {
    href: "/settings" as Route,
    label: "Company & brand",
    icon: BuildingsIcon,
    exact: true,
  },
  {
    href: "/settings/members" as Route,
    label: "Members & roles",
    icon: UsersThreeIcon,
  },
  {
    href: "/settings/ai" as Route,
    label: "AI",
    icon: SparkleIcon,
  },
  {
    href: "/settings/email" as Route,
    label: "Email",
    icon: EnvelopeIcon,
  },
  {
    href: "/settings/integrations" as Route,
    label: "Integrations",
    icon: PlugIcon,
  },
  {
    href: "/settings/developers" as Route,
    label: "Developers & API",
    icon: Code2,
  },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:pb-0">
      {sections.map((section) => {
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
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sage text-sage-ink"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className={cn("size-4 shrink-0", active && "text-pine")} />
            <span className="whitespace-nowrap">{section.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
