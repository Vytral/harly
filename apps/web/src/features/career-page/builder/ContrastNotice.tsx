"use client";

import type { CareerPageConfig } from "@/features/career-page/config";

import { AlertIcon } from "./builder-icons";
import { accentContrastWarnings } from "./builder-logic";

/**
 * Inline WCAG warning under a colour field, with a one-click fix that swaps in
 * the nearest shade that passes. Renders nothing when the colour is fine.
 */
export function ContrastNotice({
  config,
  color,
  onFix,
  checkBackground,
}: {
  config: CareerPageConfig;
  /** The effective colour (value or its fallback). */
  color: string;
  onFix: (color: string) => void;
  checkBackground?: boolean;
}) {
  const warnings = accentContrastWarnings(config, color, { checkBackground });
  if (warnings.length === 0) return null;

  return (
    <div className="space-y-2" role="status">
      {warnings.map((w) => (
        <div
          key={w.id}
          className="flex gap-2.5 rounded-[var(--radius-inner)] border border-warning-clay/25 bg-warning-clay/[0.07] px-3 py-2.5"
        >
          <AlertIcon className="mt-0.5 size-4 shrink-0 text-warning-clay" strokeWidth={1.8} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-[12px] leading-snug text-near-ink">{w.message}</p>
            {w.suggestion ? (
              <button
                type="button"
                onClick={() => onFix(w.suggestion!)}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-btn)] border border-hairline bg-pure-snow px-2 py-1 text-[12px] font-medium text-near-ink transition-colors hover:bg-card-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  aria-hidden
                  className="size-3 rounded-full border border-hairline"
                  style={{ background: w.suggestion }}
                />
                Use readable shade {w.suggestion}
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
