"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ApplicationRejectionSummary = {
  reasonLabel: string | null;
  /** Internal note: team-only, never shown to the candidate. */
  note: string | null;
  rejectedAt: string | null;
};

/**
 * "Rejected · Skills mismatch". The internal note opens on hover or keyboard
 * focus; with no note it is plain text.
 */
export function RejectionReasonTag({
  rejection,
  showStatus = true,
  className,
}: {
  rejection: ApplicationRejectionSummary | null | undefined;
  /** Prefix with "Rejected ·" (off when a status badge already says so). */
  showStatus?: boolean;
  className?: string;
}) {
  if (!rejection?.reasonLabel) return null;
  const text = showStatus ? `Rejected · ${rejection.reasonLabel}` : rejection.reasonLabel;
  const base = cn("text-[13px] leading-5 text-soft-ink", className);
  if (!rejection.note) return <span className={base}>{text}</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            base,
            "rounded underline decoration-dotted underline-offset-4 outline-none hover:text-near-ink focus-visible:ring-[3px] focus-visible:ring-ring/50",
          )}
          aria-label={`${text}. Internal note: ${rejection.note}`}
        >
          {text}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 whitespace-pre-line">
        <span className="block text-[11px] font-medium uppercase tracking-wide opacity-70">
          Internal note
        </span>
        {rejection.note}
      </TooltipContent>
    </Tooltip>
  );
}
