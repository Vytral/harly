"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function ReportsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      className="flex min-h-[50dvh] flex-col items-center justify-center gap-4 px-4 text-center"
    >
      <AlertTriangle className="size-10 text-muted-foreground" strokeWidth={1.6} />
      <div>
        <h1 className="text-lg font-semibold">Reports could not be loaded</h1>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Nothing on this page was changed. The numbers may be temporarily unavailable, so try
          again in a moment.
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>
        ) : null}
      </div>
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => reset()}>
          Try again
        </Button>
        <Button asChild variant="ghost">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
