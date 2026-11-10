"use client";

import { RouteError } from "@/components/ui/route-error";
import { useTranslations } from "next-intl";

export default function DocumentsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("pages.dashboardDocuments.error");
  return (
    <RouteError
      error={error}
      reset={reset}
      title={t("title")}
      homeHref="/dashboard/documents"
      homeLabel={t("backLabel")}
    />
  );
}
