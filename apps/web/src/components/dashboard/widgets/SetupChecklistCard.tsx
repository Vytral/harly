"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ArrowRight, Check, ChevronDown, Copy, EyeOff, Rocket, Sparkles } from "lucide-react";

import { cn, copyText } from "@/lib/utils";
import { tileClass } from "@/components/dashboard/widgets/primitives";
import { SetupProgressRing } from "@/components/dashboard/SetupProgressRing";
import { Button } from "@/components/ui/button";
import type { SetupChecklist } from "@/features/dashboard/setup-checklist";
import type { ChecklistRow } from "@/features/onboarding/checklist-model";
import {
  dismissSetupChecklistAction,
  skipSetupChecklistItemAction,
} from "@/features/onboarding/checklist-actions";
import { loadSampleDataAction } from "@/features/sample-data/actions";
import { useTranslations } from "next-intl";

const COLLAPSE_KEY = "harly:setup-checklist-collapsed";

/**
 * Per-viewer convenience only: whether this browser shows the card expanded.
 * Dismiss and skip are per member and per workspace, so they live on the server.
 */
function makeCollapseStore() {
  const listeners = new Set<() => void>();
  const read = () => {
    try {
      const stored = window.localStorage.getItem(COLLAPSE_KEY);
      return stored === null ? true : stored === "1";
    } catch {
      return true;
    }
  };
  return {
    subscribe(cb: () => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    get: read,
    set(value: boolean) {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, value ? "1" : "0");
      } catch {
        // Storage disabled: the toggle still works for this page view.
      }
      listeners.forEach((listener) => listener());
    },
  };
}

const collapseStore = makeCollapseStore();
// Collapsed by default: the dashboard's hero surface is the human table, and
// setup is one row you open on purpose.
const serverTrue = () => true;

type ActionResult = { ok: boolean; error?: string };

/**
 * "Your first hour": a guided list derived from real workspace data. Rows
 * link to the next step; the pipeline step can load sample data or copy the
 * public job link once a job is live.
 */
export function SetupChecklistCard({ checklist }: { checklist: SetupChecklist }) {
  const t = useTranslations("shell.setupChecklist");
  const router = useRouter();
  const collapsed = useSyncExternalStore(
    collapseStore.subscribe,
    collapseStore.get,
    serverTrue,
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const rows = checklist.items.filter((item) => !item.done && !item.skipped);
  if (rows.length === 0) return null;

  function run(action: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? t("error"));
        return;
      }
      router.refresh();
    });
  }

  return (
    <section
      className={cn(
        tileClass,
        "overflow-hidden duration-500 animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none",
      )}
    >
      <button
        type="button"
        onClick={() => collapseStore.set(!collapsed)}
        aria-expanded={!collapsed}
        className={cn(
          "flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-row-wash",
          !collapsed && "border-b border-hairline",
        )}
      >
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-[var(--radius-btn)] border border-hairline bg-pure-snow text-near-ink">
            <Rocket className="size-[18px]" strokeWidth={1.8} />
          </span>
          <div>
            <h2 className="font-display text-[15px] font-semibold tracking-[-0.01em] text-near-ink">
              {t("title")}
            </h2>
            <p className="text-xs text-soft-ink">
              {t("progress", { completed: checklist.completed, total: checklist.total })}
              {checklist.nextStep ? (
                <>
                  {` · ${t("next")}: `}
                  <span className="font-medium text-near-ink">
                    {checklist.nextStep.title}
                  </span>
                </>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-muted sm:block">
            <div
              className="h-full rounded-full bg-pine transition-[width] duration-500 ease-out motion-reduce:transition-none"
              style={{ width: `${checklist.percent}%` }}
            />
          </div>
          <SetupProgressRing percent={checklist.percent} size={34} showLabel />
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
              collapsed && "-rotate-90",
            )}
          />
        </div>
      </button>

      {!collapsed ? (
        <>
          <ul className="divide-y divide-hairline">
            {rows.map((item, i) => (
              <li
                key={item.key}
                className="duration-500 animate-in fade-in slide-in-from-bottom-1 motion-reduce:animate-none"
                style={{
                  animationDelay: `${i * 55}ms`,
                  animationFillMode: "backwards",
                }}
              >
                <ChecklistRowView
                  item={item}
                  index={i}
                  checklist={checklist}
                  busy={pending}
                  onRun={run}
                />
              </li>
            ))}
          </ul>

          {/* Secondary actions live in the footer, never inside a row, so the
              rows keep one rhythm: text on the left, one action on the right. */}
          {checklist.visible && !checklist.sampleDataActive ? (
            <div className="flex flex-col gap-3 border-t border-hairline bg-card-inset/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-near-ink">{t("exploring")}</p>
                <p className="text-xs text-soft-ink">
                  {t("sampleHint")}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => run(() => loadSampleDataAction())}
                className="w-full shrink-0 sm:w-auto"
              >
                <Sparkles className="size-3.5" />
                {t("loadSample")}
              </Button>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-hairline px-5 py-3">
            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : (
              <span className="text-xs text-soft-ink">
                {t("hiddenHint")}
              </span>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => dismissSetupChecklistAction())}
              className="-mr-2.5 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-soft-ink transition-colors hover:bg-row-wash hover:text-near-ink disabled:opacity-50"
            >
              <EyeOff className="size-3.5" />
              {t("hide")}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

function ChecklistRowView({
  item,
  index,
  checklist,
  busy,
  onRun,
}: {
  item: ChecklistRow;
  index: number;
  checklist: SetupChecklist;
  busy: boolean;
  onRun: (action: () => Promise<ActionResult>) => void;
}) {
  const t = useTranslations("shell.setupChecklist");
  const isPipeline = item.key === "pipeline_candidates";
  const showSkip = item.optional && !item.done;

  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-3.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-card-inset text-xs font-semibold tabular-nums text-soft-ink">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-near-ink">{item.title}</p>
          <p className="mt-0.5 text-pretty text-xs text-soft-ink">{item.value}</p>
          {isPipeline && checklist.publishedJob ? (
            <div className="mt-2">
              <CopyJobLink
                title={checklist.publishedJob.title}
                url={checklist.publishedJob.url}
              />
            </div>
          ) : null}
          {showSkip ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onRun(() => skipSetupChecklistItemAction(item.key))}
              aria-label={t("skipLabel", { title: item.title })}
              className="mt-1.5 -ml-1 rounded px-1 text-xs font-medium text-soft-ink underline-offset-2 transition-colors hover:text-near-ink hover:underline disabled:opacity-50"
            >
              {t("skip")}
            </button>
          ) : null}
        </div>
      </div>
      <Button
        asChild
        variant="outline"
        size="sm"
        className="w-full shrink-0 sm:w-32"
      >
        <Link
          href={(isPipeline ? "/dashboard/candidates?import=csv" : item.href) as Route}
        >
          {isPipeline ? t("importCsv") : item.ctaLabel}
          <ArrowRight className="size-3.5" />
        </Link>
      </Button>
    </div>
  );
}

function CopyJobLink({ title, url }: { title: string; url: string }) {
  const t = useTranslations("shell.setupChecklist");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await copyText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-2.5 py-1.5 text-xs">
      <span className="shrink-0 text-muted-foreground">{t("live", { title })}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-foreground/80">{url}</span>
      <button
        type="button"
        onClick={copy}
        aria-label={t("copyPublicLabel", { title })}
        className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-medium text-primary transition-colors hover:bg-background"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? t("copied") : t("copyLink")}
      </button>
    </div>
  );
}
