"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, Check, ChevronDown, Rocket } from "lucide-react";

import { cn } from "@/lib/utils";
import { tileClass } from "@/components/dashboard/widgets/primitives";
import { SetupProgressRing } from "@/components/dashboard/SetupProgressRing";
import type { SetupChecklist } from "@/features/dashboard/setup-checklist";

const DISMISS_KEY = "harly:setup-checklist-dismissed";
const COLLAPSE_KEY = "harly:setup-checklist-collapsed";

/**
 * A localStorage-backed boolean shared with React via useSyncExternalStore.
 * The SSR snapshot must equal `fallback`, so the server and the first client
 * render agree and nothing needs a setState-in-effect.
 */
function makePersistedFlag(key: string, fallback = false) {
  const listeners = new Set<() => void>();
  const read = () => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored === null ? fallback : stored === "1";
    } catch {
      return fallback;
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
// Collapsed by default. Home's hero surface is the human table; setup is a
// single row you open on purpose, not a panel sitting on top of the work.
const collapseStore = makePersistedFlag(COLLAPSE_KEY, true);
const serverFalse = () => false;
const serverTrue = () => true;

/**
 * "Recommended next steps" , a progressive, benefit-led launch checklist.
 * Reads state from getSetupChecklist and links to existing pages. Renders as a
 * single collapsed header row by default (frame 02's stacked-row pattern), and
 * the page unmounts it entirely once every step is done.
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
    serverTrue,
  );
  const pendingItems = checklist.items.filter((item) => !item.done);

  if (dismissed) return null;

  // The 100%-complete celebration panel used to live here. Home's hero surface
  // is the human table, and a full-width card congratulating you on finishing
  // setup is exactly the noise DESIGN.md bans above it. The page now stops
  // rendering the checklist once `allDone`, so there is nothing to celebrate
  // with , finishing the list simply removes it.

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
