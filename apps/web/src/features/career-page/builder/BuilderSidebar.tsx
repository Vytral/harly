"use client";

import { type ComponentType, type SVGProps } from "react";

import { cn } from "@/lib/utils";
import {
  TemplateIcon,
  ContentIcon,
  JobsIcon,
  DesignIcon,
  FooterIcon,
} from "./builder-icons";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export type BuilderSection =
  | "template"
  | "content"
  | "jobs"
  | "design"
  | "footer";

interface NavItem {
  id: BuilderSection;
  label: string;
  icon: IconComponent;
}

const NAV_ITEMS: NavItem[] = [
  { id: "template", label: "Template", icon: TemplateIcon },
  { id: "content", label: "Content", icon: ContentIcon },
  { id: "jobs", label: "Jobs", icon: JobsIcon },
  { id: "design", label: "Design", icon: DesignIcon },
  { id: "footer", label: "Footer", icon: FooterIcon },
];

export function BuilderSidebar({
  active,
  onChange,
}: {
  active: BuilderSection;
  onChange: (section: BuilderSection) => void;
}) {
  return (
    <nav
      aria-label="Builder sections"
      className="flex w-[76px] shrink-0 flex-col items-center gap-1.5 border-r border-border bg-paper py-4"
    >
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "group relative flex w-14 flex-col items-center gap-1.5 rounded-2xl py-3 text-[11px] font-medium transition-all duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine/40",
              isActive
                ? "bg-sage/70 text-pine"
                : "text-ink-soft hover:bg-kraft hover:text-foreground",
            )}
          >
            {isActive && (
              <span className="absolute inset-y-2 -left-0.5 w-[3px] rounded-full bg-pine" />
            )}
            <Icon
              className={cn("size-[22px] transition-transform duration-150", !isActive && "group-hover:scale-105")}
              strokeWidth={1.6}
            />
            <span className="leading-none">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
