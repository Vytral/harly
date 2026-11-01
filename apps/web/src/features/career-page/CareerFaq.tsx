"use client";

import { useId, useState } from "react";

import { cn } from "@/lib/utils";

import type { CareerFaqItem } from "./config";

/**
 * FAQ accordion styled to match the Playful open-positions list: a
 * `divide-y border-t` stack, large tracking-tight question type, an accent
 * chevron, and a grid-rows reveal for the answer. Animation rules: only
 * transform/opacity + a grid-template-rows transition, custom ease-out,
 * <=250ms, and a `motion-reduce` escape hatch.
 */
export function CareerFaq({
  items,
  accent,
}: {
  items: CareerFaqItem[];
  accent: string;
}) {
  const [open, setOpen] = useState<number | null>(0);
  const baseId = useId();

  if (items.length === 0) return null;

  return (
    <div className="divide-y divide-hairline border-t border-hairline">
      {items.map((item, i) => {
        const isOpen = open === i;
        const buttonId = `${baseId}-q${i}`;
        const panelId = `${baseId}-a${i}`;
        return (
          <div key={`${i}-${item.q}`}>
            <h3>
              <button
                type="button"
                id={buttonId}
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="group flex w-full items-center justify-between gap-6 py-5 text-left transition-colors duration-150 hover:bg-row-wash sm:px-2"
              >
              <span className="text-lg font-medium tracking-tight text-near-ink">
                {item.q}
              </span>
              <span
                className="relative flex size-5 shrink-0 items-center justify-center"
                style={{ color: `var(--career-accent, ${accent})` }}
                aria-hidden
              >
                {/* Plus → minus via a rotating vertical bar. transform-only. */}
                <span className="absolute h-0.5 w-3.5 rounded-full bg-current" />
                <span
                  className={cn(
                    "absolute h-0.5 w-3.5 rounded-full bg-current transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
                    isOpen ? "rotate-0" : "rotate-90",
                  )}
                />
              </span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              inert={!isOpen}
              className={cn(
                "grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                <p
                  className={cn(
                    "max-w-2xl whitespace-pre-line pb-5 text-base leading-relaxed text-soft-ink transition-opacity duration-200 ease-out motion-reduce:transition-none sm:px-2",
                    isOpen ? "opacity-100" : "opacity-0",
                  )}
                >
                  {item.a}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
