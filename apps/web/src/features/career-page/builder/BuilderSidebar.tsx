"use client";

import { type ComponentType, type SVGProps } from "react";

import { cn } from "@/lib/utils";

import type { BuilderSection } from "./types";
import {
  TemplateIcon,
  ContentIcon,
  LayersIcon,
  JobsIcon,
  PaletteIcon,
  FooterIcon,
  GlobeIcon,
} from "./builder-icons";

export type { BuilderSection } from "./types";

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { strokeWidth?: number | string }>;

const NAV_ITEMS: { id: BuilderSection; label: string; icon: IconComponent }[] = [
  { id: "template", label: "Template", icon: TemplateIcon },
  { id: "content", label: "Content", icon: ContentIcon },
  { id: "sections", label: "Sections", icon: LayersIcon },
  { id: "jobs", label: "Jobs", icon: JobsIcon },
  { id: "design", label: "Style", icon: PaletteIcon },
  { id: "footer", label: "Footer", icon: FooterIcon },
  { id: "discovery", label: "SEO", icon: GlobeIcon },
];

/**
 * Section rail. Compact (icon over label) up to 1400px so the preview keeps
 * its room at 1280; a labelled list above that. Sections holding validation
 * errors carry a count.
 */
export function BuilderSidebar({
  active,
  onChange,
  errorCounts = {},
}: {
  active: BuilderSection;
  onChange: (section: BuilderSection) => void;
  errorCounts?: Partial<Record<BuilderSection, number>>;
}) {
  return (
    <nav
      aria-label="Builder sections"
      className={cn(
        "flex shrink-0 gap-1 border-hairline bg-warm-paper",
        // Phones: a horizontal strip above the editor.
        "w-full overflow-x-auto border-b px-2 py-2",
        "md:w-[76px] md:flex-col md:items-center md:overflow-visible md:border-b-0 md:border-r md:px-0 md:py-3",
        "min-[87.5rem]:w-[184px] min-[87.5rem]:items-stretch min-[87.5rem]:px-3",
      )}
    >
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.id;
        const errors = errorCounts[item.id] ?? 0;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            aria-current={isActive ? "page" : undefined}
            aria-label={errors > 0 ? `${item.label}, ${errors} to fix` : undefined}
            className={cn(
              "relative flex shrink-0 items-center gap-2 rounded-[var(--radius-btn)] px-3 py-2 text-[13px] font-medium transition-colors duration-150",
              "md:w-[60px] md:flex-col md:gap-1 md:px-0 md:py-2.5 md:text-[11px]",
              "min-[87.5rem]:w-full min-[87.5rem]:flex-row min-[87.5rem]:gap-2.5 min-[87.5rem]:px-2.5 min-[87.5rem]:py-2 min-[87.5rem]:text-[13px]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "bg-pure-snow text-near-ink shadow-[var(--shadow-card)]"
                : "text-soft-ink hover:bg-card-inset hover:text-near-ink",
            )}
          >
            <Icon className="size-[18px] shrink-0" strokeWidth={1.7} />
            <span className="leading-none">{item.label}</span>
            {errors > 0 ? (
              <span
                aria-hidden
                className={cn(
                  "grid min-w-4 place-items-center rounded-full bg-danger-rust px-1 text-[10px] font-semibold leading-4 text-white",
                  "md:absolute md:right-1 md:top-1",
                  "min-[87.5rem]:static min-[87.5rem]:ml-auto",
                )}
              >
                {errors}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
