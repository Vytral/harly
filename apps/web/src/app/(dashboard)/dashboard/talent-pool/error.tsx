"use client";

import { useTranslations } from "next-intl";

import { RouteError } from "@/components/ui/route-error";

export default function TalentPoolError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("pages.dashboardTalentPool.error");

  return <RouteError error={error} reset={reset} title={t("title")} />;
}
