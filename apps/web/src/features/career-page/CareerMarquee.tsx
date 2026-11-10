"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Pause, Play } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Shared auto-scrolling strip for the gallery and testimonials. Two identical
 * halves loop seamlessly (translate 0 to -50%). Meets WCAG 2.2.2: a visible
 * pause button, pausing on hover and keyboard focus, and under
 * prefers-reduced-motion the strip stops and becomes a plain scrollable row.
 * The duplicate half is `aria-hidden` and `inert` so assistive tech and the tab
 * order see each item once.
 */
export function CareerMarquee({
  children,
  speed = "slow",
  gap = "gap-4",
  label,
}: {
  children: React.ReactNode;
  speed?: "slow" | "normal";
  gap?: string;
  label: string;
}) {
  const t = useTranslations("features.careerPage.careerMarquee");
  const [paused, setPaused] = useState(false);

  return (
    <div className="career-marquee" data-paused={paused} role="group" aria-label={label}>
      <div className="career-marquee-viewport relative -mx-6 overflow-hidden px-6 [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]">
        <div
          className={cn(
            "career-marquee-track flex w-max",
            speed === "normal" ? "career-marquee-normal" : "career-marquee-slow",
          )}
        >
          <div className={cn("flex shrink-0 pr-4", gap)}>{children}</div>
          <div className={cn("career-marquee-clone flex shrink-0 pr-4", gap)} aria-hidden inert>
            {children}
          </div>
        </div>
      </div>
      <div className="mt-3 flex justify-end motion-reduce:hidden">
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
          className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-soft-ink transition-colors hover:bg-row-wash hover:text-near-ink"
        >
          {paused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
          {paused ? t("playMotion") : t("pauseMotion")}
        </button>
      </div>
    </div>
  );
}
