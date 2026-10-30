"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ArrowRight, Check, ChevronDown, Copy, EyeOff, Rocket, X } from "lucide-react";

import { cn } from "@/lib/utils";
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
        setError(result.error ?? "Something went wrong. Try again.");
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
          "flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/40",
          !collapsed && "border-b border-border/50",
        )}
      >
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-sage text-pine ring-1 ring-pine/10">
            <Rocket className="size-[18px]" strokeWidth={1.8} />
          </span>
          <div>
            <h2 className="font-display text-[15px] font-semibold tracking-tight">
              Your first hour
            </h2>
            <p className="text-xs text-muted-foreground">
              {checklist.completed} of {checklist.total} done
              {checklist.nextStep ? (
                <>
                  {" · Next: "}
                  <span className="font-medium text-foreground">
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
          <ul className="divide-y divide-border/50">
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

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 px-5 py-3">
            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : (
              <span className="text-xs text-muted-foreground">
                Hidden steps come back from your account menu.
              </span>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => dismissSetupChecklistAction())}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <EyeOff className="size-3.5" />
              Hide checklist
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
  const isPipeline = item.key === "pipeline_candidates";
  const showSkip = item.optional && !item.done;

  return (
    <div className="flex items-center gap-3.5 px-5 py-3.5">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
        <p className="truncate text-xs text-muted-foreground">{item.value}</p>
        {isPipeline ? (
          <PipelineExtras checklist={checklist} busy={busy} onRun={onRun} />
        ) : null}
      </div>
      <Link
        href={(isPipeline ? "/dashboard/candidates" : item.href) as Route}
        className="group inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-primary transition-all hover:gap-1.5"
      >
        {isPipeline ? "Import CSV" : item.ctaLabel}
        <ArrowRight className="size-4" />
      </Link>
      {showSkip ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onRun(() => skipSetupChecklistItemAction(item.key))}
          aria-label={`Skip "${item.title}"`}
          title="Skip this step"
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

function PipelineExtras({
  checklist,
  busy,
  onRun,
}: {
  checklist: SetupChecklist;
  busy: boolean;
  onRun: (action: () => Promise<ActionResult>) => void;
}) {
  const canLoadSample = checklist.visible && !checklist.sampleDataActive;
  return (
    <div className="mt-2 space-y-2">
      {canLoadSample ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => onRun(() => loadSampleDataAction())}
        >
          Load sample data
        </Button>
      ) : null}
      {checklist.publishedJob ? (
        <CopyJobLink title={checklist.publishedJob.title} url={checklist.publishedJob.url} />
      ) : null}
    </div>
  );
}

function CopyJobLink({ title, url }: { title: string; url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-2.5 py-1.5 text-xs">
      <span className="shrink-0 text-muted-foreground">Live: {title}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-foreground/80">{url}</span>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy public link for ${title}`}
        className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-medium text-primary transition-colors hover:bg-background"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
