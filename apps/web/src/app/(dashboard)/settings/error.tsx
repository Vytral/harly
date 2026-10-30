"use client";

import { RouteError } from "@/components/ui/route-error";

export default function SettingsError({
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
      title="Settings could not load"
      homeHref="/settings"
      homeLabel="Back to settings"
    />
  );
}
