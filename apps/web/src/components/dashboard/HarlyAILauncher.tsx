"use client";

import Image from "next/image";
import { X } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Bottom-right launcher for Harly AI (Deel's chat bubble). The panel opens
 * just above it; while open the mark swaps to a close glyph. Always rendered,
 * so the copilot is discoverable before AI is configured.
 */
export function HarlyAILauncher({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  const label = open ? "Close Harly AI" : "Ask Harly AI";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onToggle}
          aria-label={label}
          aria-expanded={open}
          className={cn(
            "fixed bottom-4 right-4 z-50 grid size-12 place-items-center rounded-full sm:bottom-5 sm:right-6 sm:size-[52px]",
            // White in light mode, elevated charcoal in dark; the mark carries the colour.
            "bg-pure-snow text-near-ink shadow-[var(--shadow-float)] ring-1 ring-hairline",
            "transition-[transform,background-color] duration-150 ease-out hover:scale-105 active:scale-95",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink focus-visible:ring-offset-2 focus-visible:ring-offset-warm-paper",
            "motion-reduce:transition-none motion-reduce:hover:scale-100",
          )}
        >
          <span
            className={cn(
              "col-start-1 row-start-1 grid place-items-center transition-[opacity,transform] duration-200 ease-out",
              open ? "rotate-90 scale-75 opacity-0" : "rotate-0 scale-100 opacity-100",
            )}
          >
            <Image
              src="/harly-ai-animado.svg"
              alt=""
              width={28}
              height={28}
              className="size-7"
              unoptimized
            />
          </span>
          <X
            aria-hidden="true"
            strokeWidth={2}
            className={cn(
              "col-start-1 row-start-1 size-5 transition-[opacity,transform] duration-200 ease-out",
              open ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-75 opacity-0",
            )}
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}
