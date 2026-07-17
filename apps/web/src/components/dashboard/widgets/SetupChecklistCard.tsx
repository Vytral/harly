"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, Check, ChevronDown, Rocket, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { tileClass } from "@/components/dashboard/widgets/primitives";
import { SetupProgressRing } from "@/components/dashboard/SetupProgressRing";
import type { SetupChecklist } from "@/features/dashboard/setup-checklist";

const DISMISS_KEY = "harly:setup-checklist-dismissed";
const COLLAPSE_KEY = "harly:setup-checklist-collapsed";

/**
 * A localStorage-backed boolean shared with React via useSyncExternalStore.
 * SSR snapshot is always `false`, so the server renders "expanded / not
 * dismissed" and the client reconciles on hydration , no setState-in-effect.
 */
function makePersistedFlag(key: string) {
  const listeners = new Set<() => void>();
  const read = () => {
    try {
      return window.localStorage.getItem(key) === "1";
    } catch {
      return false;
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
        window.localStorage.setItem(key, value ? "1" : "0");
      } catch {
        // Private mode / storage disabled , falls back to session-only state.
      }
      listeners.forEach((l) => l());
    },
  };
}

const dismissStore = makePersistedFlag(DISMISS_KEY);
const collapseStore = makePersistedFlag(COLLAPSE_KEY);
const serverFalse = () => false;

/**
 * "Get your workspace ready" , a progressive, benefit-led launch checklist.
 * Reads state from getSetupChecklist and links to existing pages. Completed
 * rows keep an Edit link (users come back); collapsible to a single header row;
 * at 100% it shows a one-time celebration that, once dismissed, stays hidden.
 */
export function SetupChecklistCard({ checklist }: { checklist: SetupChecklist }) {
  const dismissed = useSyncExternalStore(
    dismissStore.subscribe,
    dismissStore.get,
    serverFalse,
  );
  const collapsed = useSyncExternalStore(
    collapseStore.subscribe,
    collapseStore.get,
    serverFalse,
  );
  // Play a soft collapse before unmounting so the dashboard below glides up
  // into place instead of snapping.
  const [leaving, setLeaving] = useState(false);
  const pendingItems = checklist.items.filter((item) => !item.done);

  if (dismissed) return null;

  if (checklist.allDone) {
    return (
      <div
        className={cn(
          "grid transition-all duration-500 ease-out motion-reduce:transition-none",
          leaving ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
        )}
        onTransitionEnd={(e) => {
          // Only the wrapper's own opacity fade ends the card , ignore
          // transitions bubbling up from children (progress bar, chevron).
          if (
            leaving &&
            e.target === e.currentTarget &&
            e.propertyName === "opacity"
          ) {
            dismissStore.set(true);
          }
        }}
      >
        <div className="min-h-0 overflow-hidden">
          <section
            className={cn(
              tileClass,
              "relative overflow-hidden p-6 duration-500 animate-in fade-in slide-in-from-bottom-2",
            )}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -right-8 -top-10 size-40 rounded-full bg-sage/50 blur-2xl"
            />
            <button
              type="button"
              onClick={() => setLeaving(true)}
              aria-label="Dismiss"
              className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
            <div className="relative flex flex-col items-start gap-3">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-sage text-pine ring-1 ring-pine/10">
                <Rocket className="size-6" strokeWidth={1.8} />
              </span>
              <div className="space-y-1">
                <h2 className="font-display text-lg font-semibold tracking-tight">
                  Your workspace is ready
                </h2>
                <p className="max-w-prose text-sm text-muted-foreground">
                  You&apos;ve completed every recommended step. Time to focus on
                  what matters: hiring great people.
                </p>
              </div>
              <Button size="sm" className="mt-1" onClick={() => setLeaving(true)}>
                Got it
              </Button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <section
      className={cn(
        tileClass,
        "overflow-hidden duration-500 animate-in fade-in slide-in-from-bottom-2",
      )}
    >
      {/* Header , click to collapse/expand */}
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
              Recommended next steps
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
              "size-4 text-muted-foreground transition-transform duration-200",
              collapsed && "-rotate-90",
            )}
          />
        </div>
      </button>

      {/* Rows */}
      {!collapsed ? (
        <ul className="divide-y divide-border/50">
          {pendingItems.map((item, i) => (
            <li
              key={item.key}
              className="duration-500 animate-in fade-in slide-in-from-bottom-1"
              style={{
                animationDelay: `${i * 55}ms`,
                animationFillMode: "backwards",
              }}
            >
              <div className="flex items-center gap-3.5 px-5 py-3.5">
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-colors",
                    item.done
                      ? "bg-sage text-pine ring-1 ring-pine/15"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {item.done ? (
                    <Check className="size-4 checkmark-anim" strokeWidth={2.4} />
                  ) : (
                    i + 1
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-sm font-medium",
                      item.done ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {item.title}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.value}
                  </p>
                </div>
                <Link
                  href={item.href as Route}
                  className={cn(
                    "group inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all",
                    item.done
                      ? "text-muted-foreground hover:text-foreground"
                      : "text-primary hover:gap-1.5",
                  )}
                >
                  {item.ctaLabel}
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
