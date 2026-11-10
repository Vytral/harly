"use client";

import { RouteError } from "@/components/ui/route-error";
import { useTranslations } from "next-intl";

export default function JobsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("jobs.list");
  return <RouteError error={error} reset={reset} title={t("loadError")} />;
}
