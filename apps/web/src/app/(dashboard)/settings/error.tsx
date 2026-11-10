"use client";

import { useTranslations } from "next-intl";

import { RouteError } from "@/components/ui/route-error";

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("pages.settings.error");
  return (
    <RouteError
      error={error}
      reset={reset}
      title={t("title")}
      homeHref="/settings"
      homeLabel={t("backToSettings")}
    />
  );
}
