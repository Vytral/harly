"use client";

import { useEffect } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * The one route-level error boundary body. Used by every `error.tsx` so that a
 * failed section reads the same everywhere: a calm sentence, a retry, a way
 * home, and a short reference the user can quote to support.
 *
 * `reset` re-renders the segment. It does not reload the page, so state held
 * above the segment (the sidebar, the workspace) survives.
 */
export function RouteError({
  error,
  reset,
  title = "This page could not load",
  message = "Something went wrong while loading this section. Try again, or go back to the dashboard.",
  homeHref = "/dashboard",
  homeLabel = "Back to dashboard",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  message?: string;
  homeHref?: Route;
  homeLabel?: string;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      className="mx-auto flex min-h-[50dvh] w-full max-w-md flex-col items-center justify-center gap-5 px-4 py-12 text-center"
    >
      <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <AlertTriangle className="size-5" aria-hidden="true" />
      </span>

      <div className="space-y-1.5">
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        <p className="text-sm leading-6 text-muted-foreground">{message}</p>
        {error.digest ? (
          <p className="pt-1 text-xs text-muted-foreground">
            Error reference{" "}
            <code className="font-mono text-foreground/80">{error.digest}</code>
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={() => reset()}>Try again</Button>
        <Button asChild variant="ghost">
          <Link href={homeHref}>{homeLabel}</Link>
        </Button>
      </div>
    </div>
  );
}
