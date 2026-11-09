"use client";

import { useTranslations } from "next-intl";

import { RouteError } from "@/components/ui/route-error";

export default function TasksError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("pages.dashboardTasks.error");

  return <RouteError error={error} reset={reset} title={t("title")} />;
}
