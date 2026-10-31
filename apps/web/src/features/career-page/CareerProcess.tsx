import { cn } from "@/lib/utils";

import { accentPalette } from "./color";
import type { CareerPageConfig } from "./config";

type Process = NonNullable<CareerPageConfig["process"]>;

/** Desktop column count by step count (static class names for Tailwind). */
const LG_COLS: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
};

/** Steps that should actually render: a title is required, bodies are optional. */
export function visibleProcessSteps(process: CareerPageConfig["process"]) {
  if (!process?.enabled) return [];
  return process.steps.filter((step) => step.title.trim());
}

/**
 * "How we hire": numbered interview steps (Dribbble-style). A vertical list
 * with a connecting rail on phones, a row of cards from `lg` up (wrapping to a
 * second row past four steps). The accent appears only in the step numbers,
 * as its AA-safe dark tone on a soft tint, never as raw accent text. Static:
 * nothing animates, so there is no reduced-motion branch to maintain.
 *
 * Renders nothing when the block is disabled or has no titled steps. The
 * caller owns the section landmark; `title` renders a heading at `headingLevel`.
 */
export function CareerProcess({
  process,
  accent,
  rounded = "soft",
  title,
  headingLevel = 2,
  headingId,
  compact = false,
  className,
}: {
  process: CareerPageConfig["process"];
  accent: string;
  rounded?: "soft" | "sharp";
  /** Optional heading text. Omit when the caller renders its own heading. */
  title?: string;
  headingLevel?: 2 | 3;
  headingId?: string;
  /** Narrow contexts (job page column): small heading, at most two columns. */
  compact?: boolean;
  className?: string;
}) {
  const steps = visibleProcessSteps(process);
  if (steps.length === 0) return null;

  const pal = accentPalette(accent);
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const cols = compact ? null : LG_COLS[Math.min(steps.length, 4)];
  const card = rounded === "sharp" ? "rounded-md" : "rounded-2xl";

  return (
    <div className={className}>
      {title ? (
        <Heading
          id={headingId}
          className={cn(
            "font-semibold tracking-tight text-near-ink",
            compact ? "text-base" : "text-3xl tracking-[-0.025em] sm:text-4xl",
          )}
        >
          {title}
        </Heading>
      ) : null}
      <ol
        className={cn(
          "relative grid grid-cols-1 gap-3 sm:grid-cols-2 lg:gap-4",
          cols,
          title ? (compact ? "mt-4" : "mt-8") : null,
        )}
      >
        {steps.map((step, i) => (
          <li
            key={`${i}-${step.title}`}
            className={cn(
              "relative flex gap-4 border border-hairline bg-pure-snow p-5",
              compact ? "sm:gap-4" : "sm:flex-col sm:gap-5",
              card,
            )}
          >
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-full font-mono text-sm font-medium tabular-nums"
              style={{ backgroundColor: pal.tintBg, color: pal.ink }}
              aria-hidden
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0">
              <span className="sr-only">Step {i + 1}: </span>
              <span className="block font-medium tracking-tight text-near-ink [overflow-wrap:anywhere]">
                {step.title}
              </span>
              {step.body?.trim() ? (
                <span className="mt-1.5 block text-sm leading-relaxed text-soft-ink [overflow-wrap:anywhere]">
                  {step.body}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The process block's own type, for callers wiring props. */
export type CareerProcessConfig = Process;
