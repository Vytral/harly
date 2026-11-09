"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

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

const STATUS_DOT: Record<PublishState, string> = {
  never: "bg-warning-clay",
  dirty: "bg-warning-clay",
  publishing: "bg-quiet-mist animate-pulse motion-reduce:animate-none",
  live: "bg-success-olive",
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
  const t = useTranslations("features.careerPage.builderTopBar");
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
            <span className="hidden sm:inline">{t("exit")}</span>
          </Button>
          <span aria-hidden className="hidden h-5 w-px bg-hairline sm:block" />
          <div className="hidden min-w-0 items-center gap-2 sm:flex">
            <span className="truncate text-[14px] font-semibold text-near-ink">{t("title")}</span>
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
            <span aria-hidden className={cn("size-2 rounded-full", STATUS_DOT[state])} />
            {justPublished && state === "live" ? t("publishedJustNow") : t(`status.${state}`)}
          </span>
          <Button variant="ghost" size="sm" asChild className="text-soft-ink hover:text-near-ink">
            <a href={boardUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLinkIcon className="size-4" />
              <span className="hidden sm:inline">{t("viewLive")}</span>
            </a>
          </Button>
          <Button
            size="sm"
            onClick={onPublish}
            disabled={!canPublish}
            aria-keyshortcuts={isMac ? "Meta+S" : "Control+S"}
            title={t("publishShortcutTitle", { shortcut: isMac ? "⌘S" : "Ctrl+S" })}
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
            {state === "publishing" ? t("publishing") : state === "live" ? t("published") : t("publish")}
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
