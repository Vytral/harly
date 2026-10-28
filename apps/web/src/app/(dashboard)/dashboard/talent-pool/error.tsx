"use client";

import { RouteError } from "@/components/ui/route-error";

export default function TalentPoolError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError error={error} reset={reset} title="The talent pool could not load" />;
}
