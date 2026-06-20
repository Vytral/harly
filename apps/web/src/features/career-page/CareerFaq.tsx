"use client";

import { useState } from "react";

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

  if (items.length === 0) return null;

  return (
    <div className="divide-y divide-zinc-100 border-t border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={i}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="group flex w-full items-center justify-between gap-6 py-5 text-left transition-colors duration-150 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/50 sm:px-2"
            >
              <span className="text-lg font-medium tracking-tight text-zinc-900 dark:text-zinc-100">
                {item.q}
              </span>
              <span
                className="relative flex size-5 shrink-0 items-center justify-center"
                style={{ color: accent }}
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
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                <p
                  className={cn(
                    "max-w-2xl pb-5 text-base leading-relaxed text-zinc-600 transition-opacity duration-200 ease-out motion-reduce:transition-none dark:text-zinc-400 sm:px-2",
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
