"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  CaretRightIcon,
  CheckCircleIcon,
  UserCircleIcon,
  XIcon,
} from "@/components/ui/icons/phosphor";
import type { PortalProfileCompletion } from "./profile-completion";

const DISMISS_KEY = "portal:profile-complete-dismissed";

export function PortalProfileCompletionCard({
  completion,
}: {
  completion: PortalProfileCompletion;
}) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (completion.percentage === 100) {
    if (dismissed) return null;

    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/20">
        <CheckCircleIcon className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <p className="text-sm text-emerald-800 dark:text-emerald-300">
          Your profile is complete.
        </p>
        <Link
          href="/portal/profile"
          className="ml-auto shrink-0 text-sm font-medium text-emerald-800 underline-offset-2 hover:underline dark:text-emerald-300"
        >
          Review
        </Link>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            window.localStorage.setItem(DISMISS_KEY, "1");
            setDismissed(true);
          }}
          className="shrink-0 rounded-md p-1 text-emerald-700 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
        >
          <XIcon className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <UserCircleIcon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              Complete your profile
            </h2>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {completion.percentage}%
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Add more information to present your experience more clearly in
            future applications.
          </p>
          <div
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
            aria-label={`Profile ${completion.percentage}% complete`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={completion.percentage}
          >
            <div
              className="h-full rounded-full bg-pine transition-[width] duration-300"
              style={{ width: `${completion.percentage}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Suggested next steps: {completion.missing.slice(0, 3).join(", ")}.
          </p>
          <Link
            href="/portal/profile"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline-offset-2 hover:underline"
          >
            Complete profile
            <CaretRightIcon className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
