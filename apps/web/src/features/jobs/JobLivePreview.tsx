"use client";

import { useState } from "react";
import { Monitor, Smartphone } from "lucide-react";

import { PreviewFrame } from "@/components/preview/PreviewFrame";
import { JobChrome } from "@/features/career-page/job/JobChrome";
import { JobOverviewBody } from "@/features/career-page/job/JobOverviewBody";
import type { CareerPageConfig } from "@/features/career-page/config";
import type { WorkspaceBoardBranding } from "@/features/workspaces/board";
import { cn } from "@/lib/utils";

export type PreviewJobDraft = {
  slug: string;
  title: string;
  description: string;
  department: string;
  location: string;
  employmentType: string;
  workplaceType: string;
  experienceLevel?: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  salaryPeriod?: string;
  officeAddress?: string;
  contentSections?: unknown;
  officePhotos?: unknown;
  keywords?: unknown;
};

/**
 * In-process live preview , reuses the real public job template chain
 * (JobChrome/JobShell/JobOverviewBody), fed by the in-progress draft, no DB
 * round-trip. Overview tab only: the Apply tab performs real network calls
 * (resume presign, submit) that must never fire against an unsaved draft, so
 * every link inside the preview is inert (click-capture swallows navigation).
 */
export function JobLivePreview({
  job,
  workspace,
  config,
}: {
  job: PreviewJobDraft;
  workspace: (WorkspaceBoardBranding & { id: string }) | null;
  config: CareerPageConfig | null;
}) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

  return (
    <div className="hidden min-h-0 flex-1 flex-col p-4 pl-0 lg:flex">
     <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-card)] bg-card-inset shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between border-b border-hairline bg-card px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-quiet-mist/50" />
          <span className="size-2.5 rounded-full bg-quiet-mist/50" />
          <span className="size-2.5 rounded-full bg-quiet-mist/50" />
        </div>
        <p className="text-[13px] font-medium text-soft-ink">Live preview</p>
        <div className="flex items-center gap-1 rounded-full bg-soft-kraft p-0.5">
          {(["desktop", "mobile"] as const).map((d) => {
            const Icon = d === "desktop" ? Monitor : Smartphone;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDevice(d)}
                className={cn(
                  "rounded-full p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink",
                  device === d ? "bg-pure-snow text-near-ink shadow-[var(--shadow-card)]" : "text-soft-ink hover:text-near-ink",
                )}
                aria-label={`${d} preview`}
                aria-pressed={device === d}
              >
                <Icon className="size-4" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-6">
        {workspace && config ? (
          <PreviewFrame device={device} background={config.theme.background}>
            <div
              onClickCapture={(e) => {
                const link = (e.target as HTMLElement).closest("a");
                if (link) e.preventDefault();
              }}
            >
              <JobChrome
                config={config}
                workspace={workspace}
                job={job}
                boardRoot={`/board/${workspace.slug}`}
                activeTab="overview"
              >
                <JobOverviewBody job={job} />
              </JobChrome>
            </div>
          </PreviewFrame>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-soft-ink">
            Career page isn&apos;t configured yet , preview unavailable.
          </div>
        )}
      </div>
     </div>
    </div>
  );
}
