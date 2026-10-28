"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { removeSampleDataAction } from "./actions";

/**
 * Quiet notice shown while a sample batch is tracked. Removal only deletes the
 * rows the batch recorded, so it is safe to offer in one click to anyone who
 * can manage the workspace.
 */
export function SampleDataBanner({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await removeSampleDataAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/40 px-4 py-2.5"
    >
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">You&apos;re viewing sample data.</span>{" "}
        Sample records are labelled &ldquo;Sample&rdquo; and stay off your careers page unless you publish them.
      </p>
      <div className="flex items-center gap-3">
        {error ? (
          <span role="alert" className="text-xs text-destructive">
            {error}
          </span>
        ) : null}
        {canManage ? (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-background disabled:opacity-50"
          >
            {pending ? "Removing…" : "Remove sample data"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
