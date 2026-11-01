"use client";

import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { FocusModeTopBar } from "@/components/focus-mode/FocusModeTopBar";
import { cn } from "@/lib/utils";

import { ArrowLeftIcon, CheckIcon, ExternalLinkIcon, LoaderIcon } from "./builder-icons";

/** What the recruiter has relative to the public page. Saving publishes. */
export type PublishState =
  | "never" // never published: the live page is the default board
  | "dirty" // edits not yet live
  | "publishing"
  | "live";

const STATUS: Record<PublishState, { label: string; dot: string }> = {
  never: { label: "Not published yet", dot: "bg-warning-clay" },
  dirty: { label: "Unpublished changes", dot: "bg-warning-clay" },
  publishing: { label: "Publishing…", dot: "bg-quiet-mist animate-pulse motion-reduce:animate-none" },
  live: { label: "Live", dot: "bg-success-olive" },
};

export function BuilderTopBar({
  state,
  justPublished,
  templateLabel,
  onExit,
  onPublish,
  onTemplateClick,
  boardUrl,
}: {
  state: PublishState;
  justPublished: boolean;
  templateLabel: string;
  onExit: () => void;
  onPublish: () => void;
  onTemplateClick: () => void;
  boardUrl: string;
}) {
  const status = STATUS[state];
  const canPublish = state === "dirty" || state === "never";
  // Server snapshot is false so the shortcut hint never causes a hydration mismatch.
  const isMac = useSyncExternalStore(
    () => () => {},
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => false,
  );

  return (
    <FocusModeTopBar
      className="border-hairline bg-pure-snow/80 supports-[backdrop-filter]:bg-pure-snow/70"
      left={
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onExit} className="text-soft-ink hover:text-near-ink">
            <ArrowLeftIcon className="size-4" />
            <span className="hidden sm:inline">Exit</span>
          </Button>
          <span aria-hidden className="hidden h-5 w-px bg-hairline sm:block" />
          <div className="hidden min-w-0 items-center gap-2 sm:flex">
            <span className="truncate text-[14px] font-semibold text-near-ink">Career page</span>
            <button
              type="button"
              onClick={onTemplateClick}
              className="rounded-full bg-card-inset px-2 py-0.5 text-[12px] font-medium text-soft-ink transition-colors hover:bg-soft-kraft hover:text-near-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {templateLabel}
            </button>
          </div>
        </div>
      }
      right={
        <>
          <span
            role="status"
            aria-live="polite"
            className="hidden items-center gap-2 text-[13px] font-medium text-soft-ink md:inline-flex"
          >
            <span aria-hidden className={cn("size-2 rounded-full", status.dot)} />
            {justPublished && state === "live" ? "Published just now" : status.label}
          </span>
          <Button variant="ghost" size="sm" asChild className="text-soft-ink hover:text-near-ink">
            <a href={boardUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLinkIcon className="size-4" />
              <span className="hidden sm:inline">View live</span>
            </a>
          </Button>
          <Button
            size="sm"
            onClick={onPublish}
            disabled={!canPublish}
            aria-keyshortcuts={isMac ? "Meta+S" : "Control+S"}
            title={`Publish changes (${isMac ? "⌘S" : "Ctrl+S"})`}
            className={cn(
              "min-w-[132px]",
              canPublish && "bg-chartreuse-signal text-near-ink hover:bg-chartreuse-signal/85",
            )}
          >
            {state === "publishing" ? (
              <LoaderIcon className="size-4 animate-spin" />
            ) : state === "live" ? (
              <CheckIcon className="size-4" />
            ) : null}
            {state === "publishing" ? "Publishing…" : state === "live" ? "Published" : "Publish changes"}
            {canPublish ? (
              <kbd className="ml-1 hidden rounded bg-near-ink/10 px-1 font-sans text-[11px] font-medium lg:inline">
                {isMac ? "⌘S" : "Ctrl S"}
              </kbd>
            ) : null}
          </Button>
        </>
      }
    />
  );
}
