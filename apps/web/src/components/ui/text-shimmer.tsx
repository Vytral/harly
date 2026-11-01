import React from "react";
import { cn } from "@/lib/utils";

export type TextShimmerProps = {
  children: string;
  className?: string;
  /** Seconds per sweep. */
  duration?: number;
  /** Highlight width per character, in px. */
  spread?: number;
  as?: "span" | "p";
};

/**
 * The one shimmer in the app. Rules: only for live status text ("Reading 3
 * candidates…"), one line at a time, never on finished labels. Base colour is
 * soft-ink, the sweep is near-ink; reduced motion shows plain soft-ink text.
 */
function TextShimmerComponent({
  children,
  className,
  duration = 1.8,
  spread = 2,
  as: Tag = "span",
}: TextShimmerProps) {
  const dynamicSpread = Math.max(24, children.length * spread);

  return (
    <Tag
      className={cn(
        "relative inline-block bg-[length:250%_100%,auto] bg-clip-text text-transparent",
        "[background-repeat:no-repeat,padding-box] animate-shimmer",
        "motion-reduce:animate-none motion-reduce:bg-none motion-reduce:text-soft-ink",
        className,
      )}
      style={
        {
          "--spread": `${dynamicSpread}px`,
          "--shimmer-duration": `${duration}s`,
          backgroundImage:
            "linear-gradient(90deg,#0000 calc(50% - var(--spread)),var(--near-ink),#0000 calc(50% + var(--spread))), linear-gradient(var(--soft-ink), var(--soft-ink))",
        } as React.CSSProperties
      }
    >
      {children}
    </Tag>
  );
}

export const TextShimmer = React.memo(TextShimmerComponent);
