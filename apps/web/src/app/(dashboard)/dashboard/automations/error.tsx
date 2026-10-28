"use client";

import { RouteError } from "@/components/ui/route-error";

export default function AutomationsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError error={error} reset={reset} title="Automations could not load" />;
}
