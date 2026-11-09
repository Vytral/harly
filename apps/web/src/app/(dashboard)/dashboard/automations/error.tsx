"use client";

import { useTranslations } from "next-intl";

import { RouteError } from "@/components/ui/route-error";

export default function AutomationsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("pages.dashboardAutomations.error");
  return <RouteError error={error} reset={reset} title={t("title")} />;
}
