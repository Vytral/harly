"use client";

import { RouteError } from "@/components/ui/route-error";

export default function DocumentsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      error={error}
      reset={reset}
      title="Documents could not load"
      homeHref="/dashboard/documents"
      homeLabel="Back to documents"
    />
  );
}
