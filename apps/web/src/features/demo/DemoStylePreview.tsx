"use client";

import { useCallback, useMemo, useState } from "react";

import type { CareerPageConfig } from "@/features/career-page/config";
import { CareerPageRender } from "@/features/career-page/CareerPageRender";
import type { Job } from "@/features/career-page/types";
import type { WorkspaceBoardBranding } from "@/features/workspaces/board";

import {
  DEMO_STYLES,
  applyDemoStyle,
  type DemoStyle,
} from "./sandbox-styles";

/**
 * Public demo landing: the real careers page, re-skinnable in place. A visitor
 * flips between the four career-page templates before committing, and the one
 * on screen is carried into their sandbox via `/enter?style=…`. Switching is
 * client-side (no navigation), so the previews feel instant.
 */
export function DemoStylePreview({
  workspace,
  jobs,
  config,
  portalEnabled,
  initialStyle,
}: {
  workspace: WorkspaceBoardBranding & { id: string };
  jobs: Job[];
  config: CareerPageConfig;
  portalEnabled: boolean;
  initialStyle: DemoStyle;
}) {
  const [style, setStyle] = useState<DemoStyle>(initialStyle);
  const styled = useMemo(() => applyDemoStyle(config, style), [config, style]);

  const choose = useCallback((next: DemoStyle) => {
    setStyle(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("style", next);
      window.history.replaceState(null, "", url);
    } catch {
      // The URL is a nicety (shareable previews); the preview works without it.
    }
  }, []);

  const active = DEMO_STYLES.find((entry) => entry.key === style);

  return (
    <>
      {/* A real strip (not an overlay): it never covers the page's own header,
          and it stays clear of the cookie banner at the bottom. */}
      <div className="sticky top-0 z-50 border-b border-black/10 bg-background/95 text-foreground backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden shrink-0 text-xs font-semibold uppercase tracking-wide text-neutral-500 md:inline">
              Preview style
            </span>
            <div
              role="radiogroup"
              aria-label="Careers page style"
              className="flex min-w-0 gap-1 overflow-x-auto"
            >
              {DEMO_STYLES.map((entry) => {
                const selected = entry.key === style;
                return (
                  <button
                    key={entry.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => choose(entry.key)}
                    className={
                      selected
                        ? "shrink-0 rounded-full bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
                        : "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900"
                    }
                  >
                    {entry.label}
                  </button>
                );
              })}
            </div>
            <span className="hidden text-xs text-neutral-500 lg:inline">
              {active?.blurb}
            </span>
          </div>

          <a
            href={`/enter?style=${style}`}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-pine-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Open the ATS with this look
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M13 5l7 7-7 7M20 12H4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </div>
      </div>

      <CareerPageRender
        config={styled}
        workspace={workspace}
        jobs={jobs}
        boardRoot=""
        portalEnabled={portalEnabled}
      />
    </>
  );
}
