"use client";

import { RouteError } from "@/components/ui/route-error";
import { useTranslations } from "next-intl";

export default function DocumentTemplatesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("pages.dashboardDocumentTemplates.error");
  return <RouteError error={error} reset={reset} title={t("title")} />;
}
