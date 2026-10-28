"use client";

import { RouteError } from "@/components/ui/route-error";

export default function PipelineError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError error={error} reset={reset} title="The pipeline could not load" />;
}
